; Inno Setup script for Email Blaster
; ---------------------------------------------------------------------------
; Produces: dist\EmailBlaster-Setup-<version>.exe
;
; Build it:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\email-blaster.iss
; or let packaging\package-windows.ps1 do everything in one step.
;
; Design decisions:
;   - Per-user install: no admin prompt, installs to
;     %LOCALAPPDATA%\Programs\Email Blaster
;   - No autostart, no Windows service
;   - Customers double-click one icon; the server starts invisibly

#define MyAppName "Email Blaster"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Your Company"
#define MyAppURL "https://example.com"
#define MyAppDirName "EmailBlaster"

[Setup]
AppId={{6F1C2A54-9B7E-4E2D-8C31-2E7A5D4B9F10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\app.ico

; Per-user install, no elevation.
DefaultDirName={autopf}\{#MyAppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=

; Windows 10 and 11, 64-bit only.
MinVersion=10.0
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes

OutputDir=..\dist
OutputBaseFilename=EmailBlaster-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=app.ico
ShowLanguageDialog=no
Uninstallable=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
; The built application (server.js, .next, node_modules, node.exe)
Source: "..\dist\{#MyAppDirName}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Launchers and docs
Source: "..\packaging\launch.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\packaging\Start Email Blaster.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\packaging\Stop Email Blaster.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\packaging\README-FIRST.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\launch.vbs"; IconFilename: "{app}\app.ico"; Comment: "Open Email Blaster"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\launch.vbs"; IconFilename: "{app}\app.ico"; Comment: "Open Email Blaster"; Tasks: desktopicon

Name: "{autoprograms}\Stop {#MyAppName}"; Filename: "{app}\Stop Email Blaster.bat"; IconFilename: "{app}\app.ico"; Comment: "Stop the background server"
Name: "{autoprograms}\{#MyAppName} (show window)"; Filename: "{app}\Start Email Blaster.bat"; IconFilename: "{app}\app.ico"; Comment: "Start with a visible window, for troubleshooting"
Name: "{autoprograms}\Read me first"; Filename: "{app}\README-FIRST.txt"
Name: "{autoprograms}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\launch.vbs"; Description: "Open {#MyAppName} now"; Flags: shellexec nowait postinstall skipifsilent

[UninstallRun]
; Best effort: stop the background server before removing files.
Filename: "{app}\Stop Email Blaster.bat"; Flags: runhidden; RunOnceId: "StopServer"
