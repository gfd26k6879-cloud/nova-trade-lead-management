import { existsSync } from "node:fs";

export const G006B_WINDOWS_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

export const HAS_G006B_WINDOWS_DURABILITY_CAPABILITY =
  process.platform === "win32" && existsSync(G006B_WINDOWS_POWERSHELL);
