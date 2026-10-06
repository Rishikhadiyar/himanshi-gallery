/**
 * SHARE & DOWNLOAD UTILITIES
 * Implements Web Share API with graceful fallback to clipboard copy,
 * and standard anchor-based file downloading.
 */

/**
 * Share an item using the Web Share API (native share sheet)
 * with graceful fallback to copying the URL and showing a toast.
 * @param {Object} item - { url, title, type }
 * @param {Function} [showToast] - Optional toast callback
 */
export async function shareItem(item, showToast) {
  if (!item || !item.url) return;

  const toast = showToast || (
    window.detailPanel && typeof window.detailPanel.showToast === 'function'
      ? (msg) => window.detailPanel.showToast(msg)
      : (msg) => {
          if (window.detailPanel && typeof window.detailPanel._showToast === 'function') {
            window.detailPanel._showToast(msg);
          }
        }
  );

  try {
    const response = await fetch(item.url);
    const blob = await response.blob();
    const fileName = (item.title || 'file') + (item.type === 'video' ? '.mp4' : '.jpg');
    const file = new File([blob], fileName, { type: blob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: item.title || 'Shared from Himanshi',
      });
    } else if (navigator.share) {
      // Fallback: share the URL/title if file-sharing isn't supported on this browser
      await navigator.share({
        title: item.title || 'Shared from Himanshi',
        url: item.url,
      });
    } else {
      // Browser doesn't support Web Share API at all (e.g. some desktop browsers)
      throw new Error('not-supported');
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // user cancelled the share sheet, not an error
    // Fallback for unsupported browsers: copy link instead, reuse existing toast mechanism
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(item.url);
      } catch (clipErr) {
        // ignore clipboard permission error
      }
    }
    if (typeof toast === 'function') {
      toast('Sharing not supported on this browser — link copied instead');
    }
  }
}

/**
 * Trigger file download for an item.
 * @param {Object} item - { url, title, type }
 */
export async function downloadItem(item) {
  if (!item || !item.url) return;

  // Attempt blob download first for cross-origin or local files to ensure clean filename
  try {
    if (item.url && !item.url.startsWith('blob:')) {
      const res = await fetch(item.url);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = (item.title || 'download') + (item.type === 'video' ? '.mp4' : '.jpg');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
      }
    }
  } catch (e) {
    // If fetch failed (e.g. CORS), fallback to standard direct anchor download
  }

  const a = document.createElement('a');
  a.href = item.url;
  a.download = (item.title || 'download') + (item.type === 'video' ? '.mp4' : '.jpg');
  document.body.appendChild(a);
  a.click();
  a.remove();
}
