; CapKit installer hooks (wired via bundle.windows.nsis.installerHooks).
;
; A running tray process holds capkit-desktop.exe open, which makes the old
; uninstaller report "Unable to uninstall!" and the extractor fail writing the
; file. Both hooks stop any CapKit process and wait until the exe is gone or
; writable again before the normal flow continues.
;
; The uninstaller can only Call functions named "un.*", so the body exists
; twice with distinct labels.

!macro NSIS_HOOK_PREINSTALL
  Call CapKitKillAndWait
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Call un.CapKitKillAndWait
!macroend

Function CapKitKillAndWait
  ; Ignore the exit code: 128 only means no CapKit process was running.
  nsExec::Exec 'taskkill /F /T /IM capkit-desktop.exe'
  Pop $0
  StrCpy $1 0
  CapKitKillAndWait_loop:
    IntCmp $1 40 CapKitKillAndWait_locked
    IntOp $1 $1 + 1
    Sleep 250
    ; Absent is fine; only a locked file blocks us.
    IfFileExists "$INSTDIR\capkit-desktop.exe" CapKitKillAndWait_probe
    Goto CapKitKillAndWait_done
  CapKitKillAndWait_probe:
    ; The file exists here, so opening for append never creates it, and fails
    ; while a running process holds it. Closing without writing changes nothing.
    ClearErrors
    FileOpen $2 "$INSTDIR\capkit-desktop.exe" a
    IfErrors CapKitKillAndWait_loop CapKitKillAndWait_unlocked
  CapKitKillAndWait_unlocked:
    FileClose $2
  CapKitKillAndWait_done:
    Return
  CapKitKillAndWait_locked:
    MessageBox MB_OK|MB_ICONSTOP "CapKit is still running. Close it from the system tray, then run setup again."
    Abort
FunctionEnd

Function un.CapKitKillAndWait
  ; Ignore the exit code: 128 only means no CapKit process was running.
  nsExec::Exec 'taskkill /F /T /IM capkit-desktop.exe'
  Pop $0
  StrCpy $3 0
  un_CapKitKillAndWait_loop:
    IntCmp $3 40 un_CapKitKillAndWait_locked
    IntOp $3 $3 + 1
    Sleep 250
    ; Absent is fine; only a locked file blocks us.
    IfFileExists "$INSTDIR\capkit-desktop.exe" un_CapKitKillAndWait_probe
    Goto un_CapKitKillAndWait_done
  un_CapKitKillAndWait_probe:
    ; The file exists here, so opening for append never creates it, and fails
    ; while a running process holds it. Closing without writing changes nothing.
    ClearErrors
    FileOpen $4 "$INSTDIR\capkit-desktop.exe" a
    IfErrors un_CapKitKillAndWait_loop un_CapKitKillAndWait_unlocked
  un_CapKitKillAndWait_unlocked:
    FileClose $4
  un_CapKitKillAndWait_done:
    Return
  un_CapKitKillAndWait_locked:
    MessageBox MB_OK|MB_ICONSTOP "CapKit is still running. Close it from the system tray, then run setup again."
    Abort
FunctionEnd
