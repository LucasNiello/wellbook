/** Adaptação do Blurry Blob do Animata com as cores do tema Ônix. */
export function BlurryBlob() {
  return (
    <div className="blurry-blob-animata pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span className="blurry-blob-animata__forma blurry-blob-animata__forma--dourada" />
      <span className="blurry-blob-animata__forma blurry-blob-animata__forma--amarela" />
    </div>
  );
}
