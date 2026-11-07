export async function copyTextToClipboard(
  text: string,
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function downloadTextFile(
  filename: string,
  contents: string,
  type: string,
): boolean {
  let link: HTMLAnchorElement | null = null;
  let url: string | null = null;

  try {
    const blob = new Blob([contents], { type });
    url = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link?.remove();

    if (url !== null) {
      const objectUrl = url;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  }
}
