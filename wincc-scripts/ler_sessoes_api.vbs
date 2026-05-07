' TRIGGER: Timer 1000 ms

Sub LerSessoesAPI()

    Dim http, linhas, linha, partes, i
    Dim c1, c2

    On Error Resume Next

    Set http = CreateObject("MSXML2.ServerXMLHTTP")
    http.setTimeouts 500, 500, 500, 500   ' resolve, connect, send, receive — ms
    http.Open "GET", "http://172.29.164.10:8080/sessoes/simples", False
    http.Send

    If Err.Number <> 0 Or http.status <> 200 Then
        Set http = Nothing
        Err.Clear
        Exit Sub
    End If

    linhas = Split(http.responseText, Chr(10))
    Set http = Nothing

    For i = 0 To UBound(linhas)
        linha = Trim(linhas(i))
        If InStr(linha, "=") > 0 Then
            partes = Split(linha, "=", 2)
            Select Case Trim(partes(0))
                Case "Cliente1" : c1 = Trim(partes(1))
                Case "Cliente2" : c2 = Trim(partes(1))
            End Select
        End If
    Next

    HMIRuntime.Tags("Cliente1User").Write c1
    HMIRuntime.Tags("Cliente2User").Write c2

    Err.Clear
    On Error GoTo 0

End Sub
