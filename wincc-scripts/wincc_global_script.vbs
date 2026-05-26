' =============================================================================
' WinCC Global Script — Life_Bit para wincc-agent local
' =============================================================================
' Coloca em: WinCC Explorer > Global Scripts > Action
' Ciclo: 3000ms (3s)
'
' Logica:
'   1. Le a tag local "Life_Bit"
'   2. Inverte o bit (toggle)
'   3. Escreve de volta na tag
'   4. Envia POST para o wincc-agent local (127.0.0.1:8181)
'      o agente regista o timestamp e reporta wincc_vivo=true ao backend
' =============================================================================

Sub WinCCAlive()

    Dim http
    Dim bit

    On Error Resume Next

    ' Le e inverte o Life_Bit
    bit = HMIRuntime.Tags("Life_Bit").Read
    If bit = 0 Then
        bit = 1
    Else
        bit = 0
    End If
    HMIRuntime.Tags("Life_Bit").Write bit

    ' Envia sinal de vida para o wincc-agent local
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", "http://127.0.0.1:8181/wincc-alive", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send "{""life_bit"":" & bit & "}"

    Set http = Nothing
    Err.Clear
    On Error GoTo 0

End Sub
