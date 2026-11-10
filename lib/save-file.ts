// Save a generated file. The Cloudflare build downloads through a temporary <a download>;
// the Claude-artifact build registers window.__rsgSaveFile (see artifact/artifact-store.ts),
// because a sandboxed artifact frame cannot start downloads itself.
type SaveHook = (fileName: string, blob: Blob) => void;

export function saveFile(fileName: string, blob: Blob) {
  const hook = (window as unknown as { __rsgSaveFile?: SaveHook }).__rsgSaveFile;
  if (hook) {
    hook(fileName, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
