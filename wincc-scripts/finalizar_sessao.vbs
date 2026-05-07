' Mouse Click — Deslogar operador do acesso remoto
' Chamar: FinalizarSessao "cliente1", "RG"
'         FinalizarSessao "cliente2", "PN"

Sub FinalizarSessao(cliente, eclusa)

    Dim http, body

    On Error Resume Next

    Set http = CreateObject("MSXML2.ServerXMLHTTP")
    http.setTimeouts 500, 500, 500, 500

    ' Encerrar sessao — API desconecta o RDP automaticamente
    body = "{""cliente"":""" & cliente & """}"
    http.Open "POST", "http://172.29.164.10:8080/sessoes/encerrar", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send body

    ' Eclusa volta a LIVRE
    body = "{""status"":0,""modo"":""LIVRE"",""posto"":"""",""usuario"":""""}"
    http.Open "POST", "http://172.29.164.10:8080/eclusas/" & eclusa & "/estado", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send body

    Set http = Nothing
    Err.Clear
    On Error GoTo 0

End Sub
