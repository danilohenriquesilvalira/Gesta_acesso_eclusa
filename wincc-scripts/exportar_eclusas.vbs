' exportar_eclusas.vbs
' WinCC Explorer 7.5 - Global Scripts > VBS Actions
' TRIGGER: Timer 2000 ms
' Chama: ExportarEclusas

Sub ExportarEclusas()

    Dim CL_Status, CL_Posto, CL_Usuario
    Dim CM_Status, CM_Posto, CM_Usuario
    Dim PN_Status, PN_Posto, PN_Usuario
    Dim RG_Status, RG_Posto, RG_Usuario
    Dim VR_Status, VR_Posto, VR_Usuario
    Dim ts, json
    Dim fso, f

    ' --- Valores por defeito (usados se a tag falhar) ---
    CL_Status = 0 : CL_Posto = "" : CL_Usuario = ""
    CM_Status = 0 : CM_Posto = "" : CM_Usuario = ""
    PN_Status = 0 : PN_Posto = "" : PN_Usuario = ""
    RG_Status = 0 : RG_Posto = "" : RG_Usuario = ""
    VR_Status = 0 : VR_Posto = "" : VR_Usuario = ""

    ' --- Ler cada tag individualmente ---
    ' Err.Clear apos cada leitura: um erro numa tag nao para o resto
    On Error Resume Next

    CL_Status  = CInt(HMIRuntime.Tags("Eclusa_CL_Status").Read())  : Err.Clear
    CL_Posto   = CStr(HMIRuntime.Tags("Eclusa_CL_Posto").Read())   : Err.Clear
    CL_Usuario = CStr(HMIRuntime.Tags("Eclusa_CL_Usuario").Read()) : Err.Clear

    CM_Status  = CInt(HMIRuntime.Tags("Eclusa_CM_Status").Read())  : Err.Clear
    CM_Posto   = CStr(HMIRuntime.Tags("Eclusa_CM_Posto").Read())   : Err.Clear
    CM_Usuario = CStr(HMIRuntime.Tags("Eclusa_CM_Usuario").Read()) : Err.Clear

    PN_Status  = CInt(HMIRuntime.Tags("Eclusa_PN_Status").Read())  : Err.Clear
    PN_Posto   = CStr(HMIRuntime.Tags("Eclusa_PN_Posto").Read())   : Err.Clear
    PN_Usuario = CStr(HMIRuntime.Tags("Eclusa_PN_Usuario").Read()) : Err.Clear

    RG_Status  = CInt(HMIRuntime.Tags("Eclusa_RG_Status").Read())  : Err.Clear
    RG_Posto   = CStr(HMIRuntime.Tags("Eclusa_RG_Posto").Read())   : Err.Clear
    RG_Usuario = CStr(HMIRuntime.Tags("Eclusa_RG_Usuario").Read()) : Err.Clear

    VR_Status  = CInt(HMIRuntime.Tags("Eclusa_VR_Status").Read())  : Err.Clear
    VR_Posto   = CStr(HMIRuntime.Tags("Eclusa_VR_Posto").Read())   : Err.Clear
    VR_Usuario = CStr(HMIRuntime.Tags("Eclusa_VR_Usuario").Read()) : Err.Clear

    ' --- Montar JSON ---
    ' Format() pode retornar vazio no WinCC conforme locale - usar funcoes individuais
    ts = Year(Now()) & "-" & Right("0" & Month(Now()), 2) & "-" & Right("0" & Day(Now()), 2) & " " & Right("0" & Hour(Now()), 2) & ":" & Right("0" & Minute(Now()), 2) & ":" & Right("0" & Second(Now()), 2)

    json = "{"                                                                         & Chr(13) & Chr(10)
    json = json & "  ""timestamp"": """ & ts & ""","                                   & Chr(13) & Chr(10)
    json = json & "  ""eclusas"": {"                                                   & Chr(13) & Chr(10)
    json = json & "    ""CL"": " & BlocoEclusa(CL_Status, CL_Posto, CL_Usuario) & "," & Chr(13) & Chr(10)
    json = json & "    ""CM"": " & BlocoEclusa(CM_Status, CM_Posto, CM_Usuario) & "," & Chr(13) & Chr(10)
    json = json & "    ""PN"": " & BlocoEclusa(PN_Status, PN_Posto, PN_Usuario) & "," & Chr(13) & Chr(10)
    json = json & "    ""RG"": " & BlocoEclusa(RG_Status, RG_Posto, RG_Usuario) & "," & Chr(13) & Chr(10)
    json = json & "    ""VR"": " & BlocoEclusa(VR_Status, VR_Posto, VR_Usuario)        & Chr(13) & Chr(10)
    json = json & "  }"                                                                & Chr(13) & Chr(10)
    json = json & "}"

    ' --- Escrever ficheiro (sempre, independentemente de erros nas tags) ---
    Set fso = CreateObject("Scripting.FileSystemObject")

    If Not fso.FolderExists("C:\wincc_state") Then
        fso.CreateFolder "C:\wincc_state"
        Err.Clear
    End If

    Set f = fso.CreateTextFile("C:\wincc_state\eclusas.json", True)
    f.Write json
    f.Close

    Set f   = Nothing
    Set fso = Nothing

End Sub


Function BlocoEclusa(status, posto, usuario)
    Dim modo
    If status = 1 Then
        modo = "OPERACAO"
    ElseIf status = 2 Then
        modo = "SUPERVISAO"
    Else
        modo = "LIVRE"
    End If

    BlocoEclusa = "{""status"":" & status & _
                  ",""modo"":"""    & modo            & """" & _
                  ",""posto"":"""   & EscJson(posto)  & """" & _
                  ",""usuario"":""" & EscJson(usuario) & """}"
End Function


Function EscJson(s)
    Dim r
    r = Trim(s)
    r = Replace(r, "\",  "\\")
    r = Replace(r, """", "\""")
    EscJson = r
End Function
