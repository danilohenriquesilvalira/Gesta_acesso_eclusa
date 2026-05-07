' =============================================================================
' ler_json_para_tags.vbs  —  Le C:\wincc_state\eclusas.json e escreve nas tags
' =============================================================================
' TRIGGER: Timer 2000 ms  (ou o mesmo ciclo que o backend atualiza)
'
' JSON esperado (exemplo):
'   "RG": {"status":1,"modo":"OPERACAO","posto":"Posto1","usuario":"Danilo"}
'
' Adaptar apenas a secao "CONFIGURACAO DE TAGS" no fim do script.
' =============================================================================

Sub LerJsonParaTags()

    Dim json, fso, f
    Dim RG_posto, RG_usuario, RG_status
    Dim PN_posto, PN_usuario, PN_status

    ' ── 1. Ler ficheiro ──────────────────────────────────────────────────────
    On Error Resume Next

    Set fso = CreateObject("Scripting.FileSystemObject")

    If Not fso.FileExists("C:\wincc_state\eclusas.json") Then
        Set fso = Nothing
        Exit Sub          ' ficheiro ainda nao existe — nao fazer nada
    End If

    Set f = fso.OpenTextFile("C:\wincc_state\eclusas.json", 1) ' 1 = ForReading
    json  = f.ReadAll
    f.Close

    Set f   = Nothing
    Set fso = Nothing
    Err.Clear

    If Len(Trim(json)) = 0 Then Exit Sub  ' ficheiro vazio

    ' ── 2. Extrair campos de cada eclusa ─────────────────────────────────────
    ' Funcao ExtrairCampo(json, nomeEclusa, nomeCampo)
    ' Funciona para campos de texto ("posto","usuario","modo") e numericos (status)

    RG_status  = CInt(ExtrairCampo(json, "RG", "status"))
    RG_posto   = ExtrairCampo(json, "RG", "posto")
    RG_usuario = ExtrairCampo(json, "RG", "usuario")

    PN_status  = CInt(ExtrairCampo(json, "PN", "status"))
    PN_posto   = ExtrairCampo(json, "PN", "posto")
    PN_usuario = ExtrairCampo(json, "PN", "usuario")

    ' (adicionar CL, CM, VR da mesma forma se necessario)

    ' ── 3. CONFIGURACAO DE TAGS ──────────────────────────────────────────────
    ' Substituir os nomes entre aspas pelos nomes reais das tags no WinCC
    ' Exemplo: "Cliente1" e o nome do tag de texto no WinCC

    On Error Resume Next

    ' --- Eclusa RG (Posto 1) ---
    HMIRuntime.Tags("Cliente1").Write RG_usuario   ' nome do operador RDP
    HMIRuntime.Tags("Posto1_Nome").Write RG_posto   ' ex: "Posto1"
    HMIRuntime.Tags("Posto1_Status").Write RG_status ' 0=LIVRE 1=OPERACAO

    ' --- Eclusa PN (Posto 2) ---
    HMIRuntime.Tags("Cliente2").Write PN_usuario
    HMIRuntime.Tags("Posto2_Nome").Write PN_posto
    HMIRuntime.Tags("Posto2_Status").Write PN_status

    Err.Clear
    On Error GoTo 0

End Sub


' =============================================================================
' ExtrairCampo  —  extrai o valor de um campo do JSON
'
'   json      : conteudo completo do ficheiro
'   eclusa    : "RG", "PN", "CL", "CM", "VR"
'   campo     : "status", "modo", "posto", "usuario"
'
' Funciona porque cada eclusa fica numa linha:
'   "RG": {"status":1,"modo":"OPERACAO","posto":"Posto1","usuario":"Danilo"}
' =============================================================================
Function ExtrairCampo(json, eclusa, campo)

    Dim posEclusa, posChave, posInicio, posFim, valor
    Dim chave

    ExtrairCampo = ""

    ' Localizar o bloco da eclusa dentro do JSON
    posEclusa = InStr(json, """" & eclusa & """:")
    If posEclusa = 0 Then Exit Function

    ' Dentro do bloco, localizar o campo desejado
    chave     = """" & campo & """"
    posChave  = InStr(posEclusa, json, chave)
    If posChave = 0 Then Exit Function

    ' Avancar ate ao ":" depois do nome do campo
    posInicio = InStr(posChave, json, ":") + 1
    If posInicio = 0 Then Exit Function

    ' Remover espacos
    Do While Mid(json, posInicio, 1) = " "
        posInicio = posInicio + 1
    Loop

    If Mid(json, posInicio, 1) = """" Then
        ' Valor de texto: extrair entre aspas
        posInicio = posInicio + 1
        posFim    = InStr(posInicio, json, """")
        valor     = Mid(json, posInicio, posFim - posInicio)
    Else
        ' Valor numerico: extrair ate virgula ou }
        posFim = posInicio
        Do While posFim <= Len(json)
            Dim c : c = Mid(json, posFim, 1)
            If c = "," Or c = "}" Or c = Chr(13) Or c = Chr(10) Then Exit Do
            posFim = posFim + 1
        Loop
        valor = Trim(Mid(json, posInicio, posFim - posInicio))
    End If

    ExtrairCampo = valor

End Function
