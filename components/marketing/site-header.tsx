"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const navigation = [
  { href: "/product", label: "Product" },
  { href: "/educators", label: "Educators" },
  { href: "/schools", label: "Schools" },
  { href: "/about", label: "About" }
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);
  const desktopLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const desktopFocusTargetRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  const closeMenu = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = true;
    }
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const surroundingElements = Array.from(
      headerRef.current?.parentElement?.children ?? []
    ).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== headerRef.current
    );
    const previousInertStates = surroundingElements.map((element) => ({
      element,
      inert: element.inert
    }));
    const brandWasInert = brandRef.current?.inert ?? false;

    document.body.style.overflow = "hidden";
    surroundingElements.forEach((element) => {
      element.inert = true;
    });
    if (brandRef.current) {
      brandRef.current.inert = true;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      firstMenuLinkRef.current?.focus();
    });

    const getFocusBoundary = () => {
      const menuItems = menuRef.current
        ? Array.from(
            menuRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];
      return toggleRef.current ? [toggleRef.current, ...menuItems] : menuItems;
    };

    const containKeyboardFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusBoundary = getFocusBoundary();
      const first = focusBoundary[0];
      const last = focusBoundary.at(-1);
      if (!first || !last) {
        return;
      }

      if (!focusBoundary.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        headerRef.current &&
        event.target instanceof Node &&
        !headerRef.current.contains(event.target)
      ) {
        closeMenu(true);
      }
    };
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        const activeElement = document.activeElement;
        const activeMobileHref =
          activeElement instanceof HTMLAnchorElement &&
          menuRef.current?.contains(activeElement)
            ? activeElement.dataset.navigationHref
            : undefined;
        desktopFocusTargetRef.current = activeMobileHref
          ? desktopLinkRefs.current[activeMobileHref] ?? brandRef.current
          : brandRef.current;
        closeMenu(false);
      }
    };
    const desktopQuery = window.matchMedia("(min-width: 721px)");

    document.addEventListener("keydown", containKeyboardFocus);
    document.addEventListener("pointerdown", closeOutside);
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      previousInertStates.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      if (brandRef.current) {
        brandRef.current.inert = brandWasInert;
      }
      document.removeEventListener("keydown", containKeyboardFocus);
      document.removeEventListener("pointerdown", closeOutside);
      desktopQuery.removeEventListener("change", closeAtDesktop);
      const desktopFocusTarget = desktopFocusTargetRef.current;
      desktopFocusTargetRef.current = null;
      if (desktopFocusTarget) {
        desktopFocusTarget.focus();
      } else if (restoreFocusRef.current) {
        window.requestAnimationFrame(() => toggleRef.current?.focus());
      }
      restoreFocusRef.current = false;
    };
  }, [closeMenu, open]);

  return (
    <header ref={headerRef} className="marketing-header">
      <div className="marketing-shell marketing-header-inner">
        <Link
          ref={brandRef}
          href="/"
          className="marketing-brand"
          aria-label="Imagine home"
        >
          <Image
            src="/brand/imagineer-shortform.png"
            alt=""
            width={34}
            height={34}
            priority
          />
          <span>Imagine</span>
        </Link>

        <nav className="marketing-desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                ref={(node) => {
                  desktopLinkRefs.current[item.href] = node;
                }}
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="marketing-menu-toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="marketing-mobile-navigation"
          onClick={() => {
            if (open) {
              closeMenu(false);
            } else {
              setOpen(true);
            }
          }}
        >
          <span />
          <span />
        </button>
      </div>

      <nav
        ref={menuRef}
        id="marketing-mobile-navigation"
        data-lenis-prevent
        aria-label="Mobile navigation"
        className={`marketing-mobile-nav ${open ? "is-open" : ""}`}
        hidden={!open}
      >
        {navigation.map((item, index) => (
          <Link
            ref={index === 0 ? firstMenuLinkRef : undefined}
            key={item.href}
            href={item.href}
            data-navigation-href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            onClick={() => closeMenu(true)}
          >
            <span className="marketing-index">0{index + 1}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
