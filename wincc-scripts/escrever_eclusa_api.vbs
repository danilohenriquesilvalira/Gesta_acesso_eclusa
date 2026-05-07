' TESTE: Escrever estado de uma eclusa no API
' Chamar manualmente ou via botao no WinCC para testar

Sub EscreverEclusaAPI()

    Dim http, body, eclusa

    ' --- Alterar aqui para testar ---
    eclusa = "RG"                     ' CL, CM, PN, RG, VR
    body = "{""status"":1,""modo"":""OPERACAO"",""posto"":""Posto1"",""usuario"":""Danilo""}"

    On Error Resume Next

    Set http = CreateObject("MSXML2.ServerXMLHTTP")
    http.setTimeouts 500, 500, 500, 500
    http.Open "POST", "http://172.29.164.10:8080/eclusas/" & eclusa & "/estado", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send body

    If Err.Number = 0 And http.status = 200 Then
        MsgBox "OK: " & http.responseText, vbInformation, "API"
    Else
        MsgBox "ERRO: status=" & http.status & " | " & Err.Description, vbCritical, "API"
    End If

    Set http = Nothing
    Err.Clear
    On Error GoTo 0

End Sub
