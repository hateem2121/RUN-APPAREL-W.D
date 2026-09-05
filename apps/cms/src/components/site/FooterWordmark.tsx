/** Server-safe stub — replaced by the fitted, spotlit island in the next task. */
export function FooterWordmark({ text }: { text: string }) {
  return (
    <div className="footer-mark">
      <div className="footer-mark__layer" aria-hidden="true">
        {text}
      </div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">
        {text}
      </div>
    </div>
  )
}
