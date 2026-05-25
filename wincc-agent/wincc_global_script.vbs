' =============================================================================
'  WinCC Global Script — Sinal de vida para wincc-agent
'  Adicionar em: Global Scripts > Actions > com ciclo de 3000ms
'
'  Este script corre a cada 3s no WinCC e envia POST para o wincc-agent
'  local (porta 8181). Se o WinCC parar, os POSTs param e o agente
'  marca wincc_vivo = false ao fim de 10s sem alive.
' =============================================================================

Sub WinCCAlive()

    Dim http

    On Error Resume Next

    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", "http://127.0.0.1:8181/wincc-alive", False
    http.setRequestHeader "Content-Type", "text/plain"
    http.Send "alive"

    ' Nao fazer nada com a resposta — e fire-and-forget
    Set http = Nothing
    Err.Clear
    On Error GoTo 0

End Sub
