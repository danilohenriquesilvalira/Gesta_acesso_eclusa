' =============================================================================
' WinCC Global Script — Life_Bit + Tela_Atual + Encerrar_Sessao
' =============================================================================
' Coloca em: WinCC Explorer > Global Scripts > Action
' Ciclo: 3000ms (3s)
'
' Tags necessarias no WinCC:
'   Life_Bit        — BOOL — toggle a cada ciclo (confirma WinCC vivo)
'   Encerrar_Sessao — BOOL — quando =1 encerra a sessao RDP do operador
'   Tela_Atual      — STRING — preenchida pelo OnOpen/OnClose de cada pagina
'                              ex: "RG", "PN", "CL" — vazio se nenhuma pagina aberta
' =============================================================================

Sub WinCCAlive()

    Dim http
    Dim bit
    Dim tela

    On Error Resume Next

    ' --- Life Bit (sinal de vida) ---
    bit = HMIRuntime.Tags("Life_Bit").Read
    If bit = 0 Then bit = 1 Else bit = 0
    HMIRuntime.Tags("Life_Bit").Write bit

    ' --- Tela Atual (pagina principal aberta) ---
    tela = HMIRuntime.Tags("Tela_Atual").Read
    If IsNull(tela) Or IsEmpty(tela) Then tela = ""

    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", "http://127.0.0.1:8181/wincc-alive", False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send "{""life_bit"":" & bit & ",""tela_atual"":""" & tela & """}"
    Set http = Nothing

    ' --- Encerrar Sessao ---
    ' Quando o operador prime o botao de desligar no WinCC, este bit vai a 1.
    ' O agente encaminha para o backend que encerra a sessao RDP.
    ' Apos envio, o bit e zerado para nao repetir o pedido no proximo ciclo.
    If HMIRuntime.Tags("Encerrar_Sessao").Read = 1 Then
        Dim ok
        ok = False
        Set http = CreateObject("MSXML2.XMLHTTP")
        http.setTimeouts 5000, 5000, 5000, 5000
        http.Open "POST", "http://127.0.0.1:8181/encerrar-sessao", False
        http.setRequestHeader "Content-Type", "application/json"
        http.Send "{}"
        If http.status = 200 Then ok = True
        Set http = Nothing
        ' So zera o bit se chegou ao agente — se falhou, retenta no proximo ciclo (3s)
        If ok Then HMIRuntime.Tags("Encerrar_Sessao").Write 0
    End If

    Err.Clear
    On Error GoTo 0

End Sub
