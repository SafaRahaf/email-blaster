' Email Blaster launcher
' -----------------------
' Starts the local server invisibly, then opens the app in a borderless
' "app mode" window (Edge/Chrome --app). That means no address bar, no tabs and
' no bookmarks bar, so it looks like a desktop application instead of a web page.
' The window uses the browser the customer already runs (their saved leads live
' in that browser's local storage). If that browser has no app mode, the default
' browser opens normally instead.
' If the server is already running, it just opens the window (single instance).
' No console window is ever shown.
'
' Shortcut target:  wscript.exe "<install dir>\launch.vbs"

Option Explicit

Const APP_PORT = "3100"
Const APP_URL = "http://127.0.0.1:3100"
Const TITLE = "Email Blaster"

Dim fso, sh, appDir, nodeExe, serverJs, i, ready

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = fso.BuildPath(appDir, "node.exe")
serverJs = fso.BuildPath(appDir, "server.js")

If Not fso.FileExists(nodeExe) Then
    MsgBox "node.exe is missing from:" & vbCrLf & appDir & vbCrLf & vbCrLf & _
           "Please reinstall Email Blaster.", 16, TITLE
    WScript.Quit 1
End If

If Not fso.FileExists(serverJs) Then
    MsgBox "server.js is missing from:" & vbCrLf & appDir & vbCrLf & vbCrLf & _
           "Please reinstall Email Blaster.", 16, TITLE
    WScript.Quit 1
End If

' Already running? Then just show the window.
If IsServerUp(APP_URL) Then
    OpenApp
    WScript.Quit 0
End If

' Start the server hidden.
sh.CurrentDirectory = appDir
sh.Environment("PROCESS")("PORT") = APP_PORT
sh.Environment("PROCESS")("HOSTNAME") = "127.0.0.1"
sh.Environment("PROCESS")("NODE_ENV") = "production"
sh.Run """" & nodeExe & """ """ & serverJs & """", 0, False

' Wait up to 30 seconds for it to answer.
ready = False
For i = 1 To 60
    WScript.Sleep 500
    If IsServerUp(APP_URL) Then
        ready = True
        Exit For
    End If
Next

If ready Then
    OpenApp
Else
    MsgBox "Email Blaster could not start." & vbCrLf & vbCrLf & _
           "Something may already be using port " & APP_PORT & ". Restart the PC and try again, " & _
           "or run ""Start Email Blaster (show window)"" from the Start Menu to see the error.", _
           48, TITLE
End If

' Returns True when the local web server answers.
Function IsServerUp(u)
    Dim http
    IsServerUp = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 500, 500, 500, 1000
    http.open "GET", u, False
    http.send
    If Err.Number = 0 Then
        If http.status >= 200 And http.status < 500 Then
            IsServerUp = True
        End If
    End If
    Err.Clear
    On Error GoTo 0
End Function

' Opens the app in a borderless app-mode window, preferring the customer's
' existing default browser, and falling back to Edge/Chrome/default handler.
Sub OpenApp()
    Dim args, def, exe
    args = " --app=" & APP_URL & " --window-size=1280,860"

    ' Prefer the browser the customer already uses: the app's leads and sender
    ' settings live in that browser's local storage, so switching browsers would
    ' look like the data was lost.
    def = DefaultBrowserExe()
    If def <> "" Then
        If SupportsAppMode(def) And fso.FileExists(def) Then
            sh.Run """" & def & """" & args, 1, False
        Else
            ' A browser without app mode (e.g. Firefox): a normal tab is the only
            ' way to keep that browser's saved data visible.
        sh.Run APP_URL, 1, False
    End If
        Exit Sub
    End If

    ' Could not read the default browser: try Edge, then Chrome, then the OS handler.
    For Each exe In Array( _
            sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
            sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
            sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
            sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"))
        If fso.FileExists(exe) Then
            sh.Run """" & exe & """" & args, 1, False
            Exit Sub
        End If
    Next
    sh.Run APP_URL, 1, False
End Sub

' Reads the exe path of the customer's default http browser. "" when unknown.
Function DefaultBrowserExe()
    Dim progId, cmd, p
    DefaultBrowserExe = ""
    cmd = ""
    On Error Resume Next
    progId = sh.RegRead("HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice\ProgId")
    If Err.Number = 0 Then
        cmd = sh.RegRead("HKCR\" & progId & "\shell\open\command")
    End If
    Err.Clear
    On Error GoTo 0

    cmd = Trim(cmd)
    If cmd = "" Then Exit Function
    If Left(cmd, 1) = """" Then
        p = InStr(2, cmd, """")
        If p > 2 Then DefaultBrowserExe = Mid(cmd, 2, p - 2)
    Else
        p = InStr(cmd, " ")
        If p > 1 Then DefaultBrowserExe = Left(cmd, p - 1) Else DefaultBrowserExe = cmd
    End If
End Function

' True for browsers that understand --app=<url>.
Function SupportsAppMode(exe)
    Dim n
    n = LCase(fso.GetFileName(exe))
    SupportsAppMode = (n = "msedge.exe" Or n = "chrome.exe" Or n = "brave.exe")
End Function

