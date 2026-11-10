' Email Blaster launcher
' -----------------------
' Starts the local server invisibly, then opens the app in the default browser.
' If the server is already running, it just opens the browser (single instance).
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
    sh.Run APP_URL, 1, False
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
    sh.Run APP_URL, 1, False
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
