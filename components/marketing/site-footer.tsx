import Image from "next/image";
import Link from "next/link";

const footerLinks = [
  { href: "/product", label: "Product" },
  { href: "/educators", label: "Educators" },
  { href: "/schools", label: "Schools" },
  { href: "/about", label: "About" }
];

export function SiteFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-shell marketing-footer-grid">
        <div>
          <Link href="/" className="marketing-brand" aria-label="Imagine home">
            <Image
              src="/brand/imagineer-shortform.png"
              alt=""
              width={34}
              height={34}
            />
            <span>Imagine</span>
          </Link>
          <p>Visual support that follows the lesson.</p>
        </div>
        <nav aria-label="Footer navigation">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="marketing-footer-note">
          Current product details reflect the browser-local classroom workspace.
        </p>
      </div>
    </footer>
  );
}
