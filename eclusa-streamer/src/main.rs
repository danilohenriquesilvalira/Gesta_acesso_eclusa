use rayon::prelude::*;
use serde::Deserialize;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
struct Config {
    api_url:     String,
    cliente:     String,
    fps_max:     Option<u32>,
    qualidade:   Option<u8>,
    max_largura: Option<u32>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api_url:     "http://172.29.164.10:8080".to_string(),
            cliente:     "cliente1".to_string(),
            fps_max:     Some(20),
            qualidade:   Some(40),
            max_largura: Some(1920),
        }
    }
}

fn load_config() -> Config {
    std::env::current_exe().ok()
        .and_then(|p| p.parent().map(|d| d.join("config.json")))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

// ── Captura todos os monitores e faz stitch ───────────────────────────────────

fn capturar_raw() -> Option<(Vec<u8>, u32, u32)> {
    use screenshots::Screen;

    let screens = Screen::all().ok()?;
    if screens.is_empty() { return None; }

    if screens.len() == 1 {
        let img = screens.into_iter().next()?.capture().ok()?;
        let w = img.width();
        let h = img.height();
        return Some((img.into_raw(), w, h));
    }

    let min_x = screens.iter().map(|s| s.display_info.x).min()?;
    let min_y = screens.iter().map(|s| s.display_info.y).min()?;
    let max_x = screens.iter().map(|s| s.display_info.x + s.display_info.width  as i32).max()?;
    let max_y = screens.iter().map(|s| s.display_info.y + s.display_info.height as i32).max()?;

    let total_w = (max_x - min_x) as u32;
    let total_h = (max_y - min_y) as u32;
    let mut canvas = vec![0u8; (total_w * total_h * 4) as usize];

    for screen in screens {
        let img = match screen.capture() { Ok(i) => i, Err(_) => continue };
        let ox  = (screen.display_info.x - min_x) as u32;
        let oy  = (screen.display_info.y - min_y) as u32;
        let sw  = img.width();
        let sh  = img.height();
        let raw = img.into_raw();
        for row in 0..sh {
            let src = (row * sw * 4) as usize;
            let dst = ((oy + row) * total_w + ox) as usize * 4;
            let len = (sw * 4) as usize;
            if dst + len <= canvas.len() && src + len <= raw.len() {
                canvas[dst..dst + len].copy_from_slice(&raw[src..src + len]);
            }
        }
    }

    Some((canvas, total_w, total_h))
}

// ── Downscale paralelo com rayon (média 2×2 por linha) ───────────────────────

fn reduzir_resolucao(buf: Vec<u8>, w: u32, h: u32, max_w: u32) -> (Vec<u8>, u32, u32) {
    if w <= max_w { return (buf, w, h); }

    let mut src = buf;
    let mut cw  = w;
    let mut ch  = h;

    while cw > max_w {
        let nw = cw / 2;
        let nh = ch / 2;
        let mut dst = vec![0u8; (nw * nh * 4) as usize];

        // Cada linha de saída calculada em paralelo num thread do rayon
        dst.par_chunks_mut((nw * 4) as usize)
            .enumerate()
            .for_each(|(y, row_dst)| {
                let y = y as u32;
                for x in 0..nw {
                    let i1 = (( y*2      * cw + x*2  ) * 4) as usize;
                    let i2 = (( y*2      * cw + x*2+1) * 4) as usize;
                    let i3 = (((y*2 + 1) * cw + x*2  ) * 4) as usize;
                    let i4 = (((y*2 + 1) * cw + x*2+1) * 4) as usize;
                    let od = (x * 4) as usize;

                    for c in 0..3 {
                        let s1 = src.get(i1+c).copied().unwrap_or(0) as u32;
                        let s2 = src.get(i2+c).copied().unwrap_or(0) as u32;
                        let s3 = src.get(i3+c).copied().unwrap_or(0) as u32;
                        let s4 = src.get(i4+c).copied().unwrap_or(0) as u32;
                        row_dst[od + c] = ((s1 + s2 + s3 + s4) / 4) as u8;
                    }
                    row_dst[od + 3] = 255;
                }
            });

        src = dst;
        cw  = nw;
        ch  = nh;
    }

    (src, cw, ch)
}

// ── Encode RGBA → JPEG via mozjpeg (libjpeg-turbo, 3-5× mais rápido) ─────────

fn encode_jpeg(raw: &[u8], w: u32, h: u32, quality: u8) -> Option<Vec<u8>> {
    // JCS_EXT_RGBX: aceita RGBA directamente (ignora canal A) — elimina conversão
    let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_EXT_RGBX);
    comp.set_size(w as usize, h as usize);
    comp.set_quality(quality as f32);

    let mut comp = comp.start_compress(Vec::new()).ok()?;
    let _ = comp.write_scanlines(raw);
    comp.finish().ok()
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    let cfg         = load_config();
    let url         = format!("{}/stream/{}/frame", cfg.api_url, cfg.cliente);
    let fps_max     = cfg.fps_max.unwrap_or(20).clamp(1, 60);
    let qualidade   = cfg.qualidade.unwrap_or(40).clamp(10, 95);
    let max_largura = cfg.max_largura.unwrap_or(1920);
    let frame_ms    = Duration::from_millis(1000 / fps_max as u64);

    println!("=== Eclusa Streamer (mozjpeg + rayon) ===");
    println!("Cliente     : {}", cfg.cliente);
    println!("Destino     : {}", url);
    println!("FPS max     : {}", fps_max);
    println!("Qualidade   : {}%", qualidade);
    println!("Max largura : {}px", max_largura);
    println!("Threads rayon: {}", rayon::current_num_threads());

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_millis(800))
        .build();

    // Canal cap=1: capture thread descarta se encode ocupado (frame mais recente)
    let (tx, rx) = mpsc::sync_channel::<(Vec<u8>, u32, u32)>(1);

    thread::spawn(move || {
        loop {
            if let Some(frame) = capturar_raw() {
                let _ = tx.try_send(frame);
            }
        }
    });

    let mut frames:  u64 = 0;
    let mut t_stats      = Instant::now();

    // Acumuladores para média dos sub-timers
    let mut ms_downscale: u128 = 0;
    let mut ms_encode:    u128 = 0;
    let mut ms_post:      u128 = 0;

    for (raw, w, h) in &rx {
        let t0 = Instant::now();
        let (raw_small, sw, sh) = reduzir_resolucao(raw, w, h, max_largura);
        let t1 = Instant::now();

        let Some(jpeg) = encode_jpeg(&raw_small, sw, sh, qualidade) else { continue };
        let t2 = Instant::now();

        match agent.post(&url)
            .set("Content-Type", "image/jpeg")
            .send_bytes(&jpeg)
        {
            Ok(_)  => {},
            Err(e) => {
                eprintln!("[ERRO] {e}");
                thread::sleep(Duration::from_secs(2));
                continue;
            }
        }
        let t3 = Instant::now();

        ms_downscale += t1.duration_since(t0).as_millis();
        ms_encode    += t2.duration_since(t1).as_millis();
        ms_post      += t3.duration_since(t2).as_millis();

        frames += 1;
        let elapsed = t_stats.elapsed().as_secs_f32();
        if elapsed >= 5.0 {
            let f = frames.max(1) as u128;
            println!("FPS: {:.1}  res: {}x{}  frame: {:.0}KB  | downscale: {}ms  encode: {}ms  post: {}ms",
                frames as f32 / elapsed, sw, sh,
                jpeg.len() as f32 / 1024.0,
                ms_downscale / f, ms_encode / f, ms_post / f);
            frames       = 0;
            ms_downscale = 0;
            ms_encode    = 0;
            ms_post      = 0;
            t_stats      = Instant::now();
        }

        let gasto = t0.elapsed();
        if gasto < frame_ms {
            thread::sleep(frame_ms - gasto);
        }
    }
}
