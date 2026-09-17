import { useEffect, useMemo, useRef, useState } from "react";
import {
  faBagShopping,
  faBars,
  faEnvelope,
  faLocationDot,
  faPhone,
  faShieldHalved,
  faStar,
  faTruckFast,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faInstagram, faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "react-router-dom";
import { productImageSrc } from "../lib/productImage";
import { getErrorCode } from "../lib/rtkBaseQuery";
import { shopThemeFromColor, whatsappHref } from "../lib/storefront";
import { useGetPublicBusinessLandingQuery } from "../services/invoiceApi";
import "./BusinessLandingPage.css";

const NAV = [
  ["#home", "Home"],
  ["#products", "Products"],
  ["#about", "About"],
  ["#contact", "Contact"],
];

const HIGHLIGHT_ICONS = [faShieldHalved, faTruckFast, faStar];

function initials(name) {
  const parts = String(name || "S")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.16 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ className = "", children }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`shop-reveal ${className}`.trim()}>
      {children}
    </div>
  );
}

function BrandMark({ name, logoUrl }) {
  const src = productImageSrc(logoUrl);
  if (src) return <img src={src} alt="" />;
  return <span className="shop-brand-mark">{initials(name)}</span>;
}

function ShopLink({ to, className, children }) {
  if (to && !to.startsWith("#")) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to || "#products"} className={className}>
      {children}
    </a>
  );
}

function LandingState({ title, message }) {
  return (
    <div className="shop-empty">
      <div className="shop-empty-card">
        <h1>{title}</h1>
        <p>{message}</p>
        <Link to="/" className="shop-btn">
          Go to platform
        </Link>
      </div>
    </div>
  );
}

export default function BusinessLandingPage() {
  const { slug } = useParams();
  const { data, isLoading, isError, error } = useGetPublicBusinessLandingQuery(
    slug,
    { skip: !slug }
  );
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("#home");

  const theme = useMemo(
    () => shopThemeFromColor(data?.storefront?.primaryColor),
    [data?.storefront?.primaryColor]
  );

  useEffect(() => {
    const ids = ["home", "products", "about", "contact"];
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(`#${visible.target.id}`);
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: [0.15, 0.4] }
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [data]);

  if (isLoading) {
    return (
      <div className="shop-skeleton">
        <div className="shop-skeleton-bar" />
        <div className="shop-skeleton-hero" />
      </div>
    );
  }

  if (isError || !data?.business) {
    const code = getErrorCode(error);
    return (
      <LandingState
        title="Page not available"
        message={
          code === "LANDING_NOT_FOUND"
            ? "This business has not published a public page yet."
            : "This landing page could not be loaded."
        }
      />
    );
  }

  const business = data.business;
  const page = data.storefront || {};
  const showcases = page.showcases || [];
  const categories = data.categories || [];
  const storePath = data.store?.path || null;
  const chatHref = whatsappHref(page.whatsapp || page.phone);
  const cover = productImageSrc(page.coverUrl);
  const storyImage = productImageSrc(page.storyImageUrl || page.coverUrl);
  const shopHref = storePath || "#products";
  const productCount = Number(data.productCount || 0);
  const year = new Date().getFullYear();

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="shop-landing" style={theme}>
      <header className={`shop-nav ${scrolled ? "is-scrolled" : ""}`}>
        <div className="shop-shell shop-nav-inner">
          <a href="#home" className="shop-brand" onClick={closeMenu}>
            <BrandMark name={business.name} logoUrl={page.logoUrl} />
            <strong className="shop-brand-name">{business.name}</strong>
          </a>
          <ul className="shop-links">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <a href={href} className={active === href ? "is-active" : ""}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="shop-nav-actions">
            {storePath ? (
              <Link to={storePath} className="shop-icon-btn" aria-label="Open catalog">
                <FontAwesomeIcon icon={faBagShopping} />
              </Link>
            ) : null}
            {storePath ? (
              <Link to={storePath} className="shop-btn">
                {page.ctaLabel || "Shop Now"}
              </Link>
            ) : chatHref ? (
              <a href={chatHref} target="_blank" rel="noreferrer" className="shop-btn">
                WhatsApp
              </a>
            ) : null}
            <button
              type="button"
              className="shop-menu-btn"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <FontAwesomeIcon icon={menuOpen ? faXmark : faBars} />
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="shop-nav-panel">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={closeMenu}>
                {label}
              </a>
            ))}
            {storePath ? (
              <Link to={storePath} className="shop-btn" onClick={closeMenu}>
                {page.ctaLabel || "Shop Now"}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <section id="home" className={`shop-hero ${cover ? "has-cover" : ""}`}>
        <div className="shop-hero-grid">
          <div className="shop-hero-copy">
            <p className="shop-kicker">{page.eyebrow}</p>
            <h1>{page.heroTitle}</h1>
            <p>{page.heroSubtitle}</p>
            <div className="shop-hero-actions">
              {storePath ? (
                <Link to={storePath} className="shop-btn">
                  {page.ctaLabel || "Shop Now"}
                </Link>
              ) : null}
              <a href="#about" className="shop-btn-ghost">
                Our Story
              </a>
            </div>
          </div>
          <div className="shop-hero-visual">
            {cover ? (
              <img src={cover} alt="" />
            ) : (
              <div className="shop-hero-art" aria-hidden="true">
                <span className="shop-hero-orb shop-hero-orb-a" />
                <span className="shop-hero-orb shop-hero-orb-b" />
                <span className="shop-hero-orb shop-hero-orb-c" />
                <div className="shop-hero-frame">
                  <BrandMark name={business.name} logoUrl={page.logoUrl} />
                  <strong>{business.name}</strong>
                  <em>{page.city || "Your neighbourhood shop"}</em>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {showcases.length ? (
        <section className="shop-section" style={{ paddingTop: 72 }}>
          <div className="shop-shell">
            <Reveal>
              <div className="shop-section-head">
                <div>
                  <p className="shop-kicker">Explore</p>
                  <h2 className="shop-section-title">Shop the look</h2>
                </div>
              </div>
              <div className="shop-cats">
                {showcases.map((item, index) => {
                  const src = productImageSrc(item.imageUrl);
                  return (
                    <ShopLink
                      key={`${item.title}-${index}`}
                      to={shopHref}
                      className="shop-cat"
                    >
                      {src ? (
                        <img src={src} alt="" />
                      ) : (
                        <span className="shop-cat-fallback" />
                      )}
                      <div className="shop-cat-copy">
                        <h3>{item.title || "Explore"}</h3>
                        {item.text ? <p>{item.text}</p> : null}
                      </div>
                    </ShopLink>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>
      ) : null}

      <section id="products" className="shop-section">
        <div className="shop-shell">
          <Reveal>
            <div className="shop-cta">
              <div>
                <p className="shop-kicker">The catalog</p>
                <h2 className="shop-section-title">See products & prices in the store</h2>
                <p>
                  Pack shots, rates, and orders live in the shop — not on this page.
                  Open the store to browse the full catalog.
                </p>
              </div>
              {storePath ? (
                <Link to={storePath} className="shop-btn">
                  {page.ctaLabel || "Shop Now"}
                </Link>
              ) : null}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="shop-section" style={{ paddingTop: 0 }}>
        <div className="shop-shell">
          <Reveal>
            <p className="shop-kicker">Why choose us</p>
            <h2 className="shop-section-title" style={{ marginBottom: 28 }}>
              The {business.name.replace(/\s+Co\.?$/i, "")} Difference
            </h2>
            <div className="shop-highlights">
              {(page.highlights || []).map((item, index) => (
                <article key={`${item.title}-${index}`} className="shop-highlight">
                  <span className="shop-highlight-icon">
                    <FontAwesomeIcon icon={HIGHLIGHT_ICONS[index] || faStar} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="about" className="shop-section" style={{ paddingTop: 20 }}>
        <div className="shop-shell">
          <Reveal>
            <div className="shop-story">
              <div className="shop-story-media">
                {storyImage ? (
                  <img src={storyImage} alt="" />
                ) : (
                  <div className="shop-story-fallback" />
                )}
                {productCount ? (
                  <div className="shop-stat">
                    <strong>{productCount}+</strong>
                    <span>Products available</span>
                  </div>
                ) : null}
              </div>
              <div className="shop-story-copy">
                <p className="shop-kicker">Your beauty, our passion</p>
                <h2>{page.storyTitle}</h2>
                <p>{page.about}</p>
                {storePath ? (
                  <Link to={storePath} className="shop-btn" style={{ marginTop: 28 }}>
                    {page.ctaLabel || "Shop Now"}
                  </Link>
                ) : null}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer id="contact" className="shop-footer">
        <div className="shop-shell">
          <div className="shop-footer-grid">
            <div>
              <p className="shop-footer-brand">{business.name}</p>
              <p>
                {page.address ||
                  `Your trusted source for authentic products${page.city ? ` in ${page.city}` : ""}.`}
              </p>
              <div className="shop-social">
                {page.instagramUrl ? (
                  <a href={page.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram">
                    <FontAwesomeIcon icon={faInstagram} />
                  </a>
                ) : null}
                {page.facebookUrl ? (
                  <a href={page.facebookUrl} target="_blank" rel="noreferrer" aria-label="Facebook">
                    <FontAwesomeIcon icon={faFacebookF} />
                  </a>
                ) : null}
                {chatHref ? (
                  <a href={chatHref} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                    <FontAwesomeIcon icon={faWhatsapp} />
                  </a>
                ) : null}
              </div>
            </div>
            <div>
              <h4>Shop</h4>
              <ul>
                {categories.slice(0, 5).map((category) => (
                  <li key={category.id}>
                    <Link to={shopHref}>{category.name}</Link>
                  </li>
                ))}
                {storePath ? (
                  <li>
                    <Link to={storePath}>All products</Link>
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <h4>Information</h4>
              <ul>
                <li>
                  <a href="#about">About Us</a>
                </li>
                <li>
                  <a href="#contact">Contact</a>
                </li>
                <li>
                  <a href="#products">Shop</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Contact Us</h4>
              <ul>
                {page.city ? (
                  <li>
                    <FontAwesomeIcon icon={faLocationDot} className="me-2" />
                    {page.address ? `${page.address}` : page.city}
                  </li>
                ) : null}
                {page.phone ? (
                  <li>
                    <a href={`tel:${page.phone}`}>
                      <FontAwesomeIcon icon={faPhone} className="me-2" />
                      {page.phone}
                    </a>
                  </li>
                ) : null}
                {page.email ? (
                  <li>
                    <a href={`mailto:${page.email}`}>
                      <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                      {page.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
          <div className="shop-legal">
            <span>
              © {year} {business.name}. All rights reserved.
            </span>
            <span>{page.city ? `Made with care in ${page.city}` : "Thank you for visiting"}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
