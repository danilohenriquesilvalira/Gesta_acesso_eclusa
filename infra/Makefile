# ── Projecto NEXT — Comandos de Deploy ────────────────────────────────────────
# Uso no servidor Linux:
#   make up        → arrancar (sem rebuild)
#   make deploy    → parar + rebuild + arrancar (imagem nova, dados preservados)
#   make clean     → deploy + remover imagens antigas do Docker
#   make reset     → APAGA DADOS do PostgreSQL e recomeça do zero
#   make logs      → seguir logs em tempo real
#   make status    → estado dos containers
#   make stop      → parar tudo (dados preservados)

COMPOSE = docker compose -f docker-compose.yml --env-file .env.server

.PHONY: up deploy clean reset logs status stop

up:
	$(COMPOSE) up -d
	@echo "✓ Serviços activos"
	@$(COMPOSE) ps

deploy:
	@echo "==> A parar containers..."
	$(COMPOSE) down --remove-orphans
	@echo "==> A reconstruir imagem do backend..."
	$(COMPOSE) build --no-cache api
	@echo "==> A iniciar serviços..."
	$(COMPOSE) up -d
	@echo "==> A aguardar saúde do PostgreSQL..."
	@sleep 3
	@$(COMPOSE) ps
	@echo ""
	@echo "✓ Deploy concluído — use 'make logs' para ver o arranque"

clean: deploy
	@echo "==> A limpar imagens Docker órfãs..."
	docker image prune -f
	docker builder prune -f
	@echo "✓ Docker limpo"

reset:
	@echo "ATENÇÃO: isto apaga TODOS os dados do PostgreSQL!"
	@read -p "Escreve CONFIRMAR para continuar: " c; [ "$$c" = "CONFIRMAR" ] || (echo "Cancelado." && exit 1)
	$(COMPOSE) down -v --remove-orphans
	docker image rm -f next-api 2>/dev/null || true
	docker image prune -f
	$(COMPOSE) build --no-cache api
	$(COMPOSE) up -d
	@echo "✓ Reset completo — base de dados recriada do zero"

logs:
	$(COMPOSE) logs -f api

status:
	$(COMPOSE) ps
	@echo ""
	@docker image ls | grep -E "next|postgres" || true

stop:
	$(COMPOSE) down
	@echo "✓ Serviços parados (dados preservados)"
