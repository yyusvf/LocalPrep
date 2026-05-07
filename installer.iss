; ── LocalPrep Inno Setup Script ───────────────────────────────────
; Builds a per-user installer that:
;   • Installs the Electron app
;   • Registers HKLM shell extensions for audio files (system-wide)
;   • Creates an uninstaller that removes both

#define AppName      "LocalPrep"
#define AppVersion   "0.1.0"
#define AppPublisher "yyusvf"
#define AppExeName   "LocalPrep.exe"
#define AppId        "com.localprep.app"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
; No admin needed — use HKCU+autopf (per-user Program Files)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=dist\installer
OutputBaseFilename=LocalPrep-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}
DisableProgramGroupPage=yes
; Code sign via signtool if SIGNTOOL env var is set (optional)
; SignTool=signtool

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "Create a &desktop shortcut";    GroupDescription: "Additional icons:"
Name: "shellextension"; Description: "Add &right-click menu to audio files (Explorer)"; GroupDescription: "System integration:"; Flags: checkedonce

[Files]
; Built app — adjust source path if you use a different output folder
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}";    Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Registry]
; ── Shell extension — registered under HKCU (no admin) ─────────────
; Same HKCU path used by the in-app Register button, so both methods
; produce identical keys and the app's isRegistered() works correctly.

; .mp3
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\sr";          ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\sr\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\fmt";         ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\fmt\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\meta";        ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.mp3\shell\LocalPrep\shell\meta\command";ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --file ""%1"""; Tasks: shellextension

; .flac
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\sr";          ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\sr\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\fmt";         ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\fmt\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\meta";        ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.flac\shell\LocalPrep\shell\meta\command";ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --file ""%1"""; Tasks: shellextension

; .wav
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\sr";          ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\sr\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\fmt";         ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\fmt\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\meta";        ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.wav\shell\LocalPrep\shell\meta\command";ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --file ""%1"""; Tasks: shellextension

; .ogg
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\sr";          ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\sr\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\fmt";         ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\fmt\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\meta";        ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ogg\shell\LocalPrep\shell\meta\command";ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --file ""%1"""; Tasks: shellextension

; .m4a
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\sr";          ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\sr\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\fmt";         ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\fmt\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --file ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\meta";        ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.m4a\shell\LocalPrep\shell\meta\command";ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --file ""%1"""; Tasks: shellextension

; Folder (Directory) — scans the whole folder
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep"; ValueType: string; ValueName: "MUIVerb"; ValueData: "LocalPrep"; Tasks: shellextension; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep"; ValueType: string; ValueName: "SubCommands"; ValueData: ""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\sr";           ValueType: string; ValueName: ""; ValueData: "Convert Sample Rate"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\sr\command";   ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab sr --folder ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\fmt";          ValueType: string; ValueName: ""; ValueData: "Convert Format"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\fmt\command";  ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab fmt --folder ""%1"""; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\meta";         ValueType: string; ValueName: ""; ValueData: "Edit Metadata"; Tasks: shellextension
Root: HKCU; Subkey: "Software\Classes\Directory\shell\LocalPrep\shell\meta\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" --tab meta --folder ""%1"""; Tasks: shellextension
