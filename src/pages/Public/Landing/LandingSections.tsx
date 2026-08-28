import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ArrowDown, Check, Loader2, Facebook, Instagram } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { StorefrontSettingsShape } from './ImmersiveLanding';

gsap.registerPlugin(ScrollTrigger);

/** Renders "One logo — *every finish*" with the starred span in italic serif accent. */
function renderAccentTitle(title: string) {
  if (!title.includes('*')) return title;
  return title.split('*').map((part, idx) =>
    idx % 2 === 1 ? (
      <span key={idx} className="italic font-light">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/** Same *star* convention at body weight — works mid-word, e.g. "State-of-the-Art*ist*." */
function renderAccent(text: string) {
  if (!text.includes('*')) return text;
  return text.split('*').map((part, idx) =>
    idx % 2 === 1 ? (
      <span key={idx} className="italic">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

const HERO_SLIDES = [
  { src: '/images/apparel_rack_hero.png', alt: 'Custom apparel rack' },
  { src: '/images/blank_basics_hero.png', alt: 'Premium blank garments' },
];

function splitTitleLines(title: string): string[] {
  const words = title.trim().split(/\s+/);
  if (words.length <= 3) return words;
  const perLine = Math.ceil(words.length / 3);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(' '));
  }
  return lines;
}

export function HeroSection({
  settings,
  introPlay,
  onScrollTo,
  onStart,
}: {
  settings: StorefrontSettingsShape;
  introPlay: boolean;
  onScrollTo: (id: string) => void;
  onStart: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const lines = splitTitleLines(settings.heroTitle || 'Custom Apparel Lookbook');

  // Slideshow rotation
  useEffect(() => {
    if (!introPlay) return;
    const id = setInterval(() => {
      setSlideIdx((i) => (i + 1) % HERO_SLIDES.length);
    }, 5200);
    return () => clearInterval(id);
  }, [introPlay]);

  // Intro reveal + scroll parallax
  useLayoutEffect(() => {
    if (!introPlay) return;
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) {
        gsap.set('.hero-line > span', { yPercent: 115 });
        gsap.set('.hero-fade-in', { autoAlpha: 0, y: 24 });
        gsap.set('.hero-media', { scale: 1.12 });

        const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
        tl.to('.hero-media', { scale: 1, duration: 1.6, ease: 'power3.out' }, 0)
          .to('.hero-line > span', { yPercent: 0, duration: 1.2, stagger: 0.09 }, 0.15)
          .to('.hero-fade-in', { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.7);

        gsap.to('.hero-media', {
          yPercent: 16,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
        gsap.to('.hero-content', {
          autoAlpha: 0,
          y: -70,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: '70% top',
            scrub: true,
          },
        });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, [introPlay]);

  return (
    <section
      ref={sectionRef}
      className="relative h-[100svh] overflow-hidden bg-zinc-950 text-white"
    >
      {/* Background Media */}
      <div className="hero-media absolute inset-0 will-change-transform">
        {settings.heroVideoUrl && settings.heroVideoUrl.trim() !== '' ? (
          (() => {
            const url = settings.heroVideoUrl.trim();
            let ytEmbedUrl: string | null = null;
            if (url.includes('youtu.be/')) {
              const id = url.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0];
              if (id) ytEmbedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&modestbranding=1&playsinline=1`;
            } else if (url.includes('youtube.com/watch')) {
              const params = new URLSearchParams(url.split('?')[1]);
              const id = params.get('v');
              if (id) ytEmbedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&modestbranding=1&playsinline=1`;
            } else if (url.includes('youtube.com/embed/')) {
              const id = url.split('youtube.com/embed/')[1]?.split('?')[0];
              if (id) ytEmbedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&modestbranding=1&playsinline=1`;
            }
            if (ytEmbedUrl) {
              return (
                <iframe
                  src={ytEmbedUrl}
                  className="w-full h-full object-cover pointer-events-none scale-125 border-0 opacity-[0.88]"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  title="Hero Background Video"
                />
              );
            }
            return (
              <video
                src={url}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover opacity-[0.88]"
              />
            );
          })()
        ) : (
          HERO_SLIDES.map((slide, i) => (
            <div
              key={slide.src}
              className={`absolute inset-0 overflow-hidden transition-opacity duration-[1400ms] ease-in-out ${
                i === slideIdx ? 'opacity-100 hero-slide-active' : 'opacity-0'
              }`}
            >
              <img
                src={slide.src}
                alt={slide.alt}
                className="h-full w-full object-cover brightness-[1.12] contrast-[0.98]"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/75 via-zinc-950/20 to-zinc-950/25" />
      </div>

      {/* Content */}
      <div className="hero-content relative z-10 flex h-full flex-col justify-end px-6 pb-10 md:px-12 md:pb-14">
        <h1 className="font-serif font-normal leading-[0.98] tracking-tight text-[clamp(3rem,9.5vw,9rem)]">
          {lines.map((line, i) => (
            <span key={i} className="hero-line">
              <span className={i === lines.length - 1 ? 'italic font-light' : ''}>
                {line}
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-8 flex flex-col items-start gap-6">
          <p className="hero-fade-in font-inter max-w-md text-sm font-light leading-relaxed text-zinc-300">
            {settings.heroSubtitle ||
              'Choose a themed collection to design a cohesive line, or start from our curated basics.'}
          </p>

          <div className="hero-fade-in flex flex-wrap items-center gap-3">
            <button
              data-cursor
              onClick={() => onStart('types')}
              className="font-inter group flex cursor-pointer items-center gap-3 rounded-full bg-white px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              {settings.heroPrimaryCta || 'Start your project'}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              data-cursor
              onClick={() => onScrollTo('#process')}
              className="font-inter cursor-pointer rounded-full border border-white/30 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:border-white hover:bg-white/10"
            >
              {settings.heroSecondaryCta || 'How it works'}
            </button>
          </div>
        </div>

        {/* Bottom meta row */}
        <div className="hero-fade-in font-inter mt-10 relative flex items-center justify-between border-t border-white/15 pt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          <span className="hidden md:inline">{settings.heroFooterTagline || 'Print · Embroidery · Cut & Sew'}</span>
          <button
            type="button"
            onClick={() => onScrollTo('#manifesto')}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 cursor-pointer transition-colors hover:text-white"
          >
            <ArrowDown size={12} className="animate-bounce" />
            Scroll
          </button>
          <span className="font-mono tracking-[0.3em]">
            {String(slideIdx + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Announcement marquee                                               */
/* ------------------------------------------------------------------ */

export function AnnouncementMarquee({ text }: { text: string }) {
  const items = Array.from({ length: 6 }, (_, i) => i);
  return (
    <div className="overflow-hidden border-y border-zinc-900 bg-zinc-950 py-3 text-[#faf9f5]">
      <div className="landing-marquee-track">
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0 items-center" aria-hidden={half === 1}>
            {items.map((i) => (
              <span
                key={i}
                className="font-inter flex items-center gap-6 px-6 text-[11px] font-bold uppercase tracking-[0.25em] whitespace-nowrap"
              >
                {text} <span className="text-zinc-500">✺</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manifesto — scroll-scrubbed word reveal                            */
/* ------------------------------------------------------------------ */

const MANIFESTO =
  'Your brand deserves better than clip-art on a blank. We turn logos into lookbooks — cohesive collections built on premium garments, designed by you in minutes and produced by people who print every day.';

export function ManifestoSection({ settings }: { settings?: StorefrontSettingsShape }) {
  const sectionRef = useRef<HTMLElement>(null);
  const manifestoText = settings?.manifestoText || MANIFESTO;
  // Line breaks typed in the customizer are kept; words still animate one by one
  const lines = manifestoText.split(/\r?\n/);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.set('.manifesto-word', { opacity: 0.12 });
      gsap.to('.manifesto-word', {
        opacity: 1,
        stagger: 0.04,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 75%',
          end: 'bottom 55%',
          scrub: 0.6,
        },
      });
      gsap.from('.manifesto-label', {
        autoAlpha: 0,
        y: 20,
        duration: 0.8,
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [manifestoText]);

  return (
    <section id="manifesto" ref={sectionRef} className="bg-white px-6 pt-10 pb-16 md:px-12 md:pt-12 md:pb-20">
      <div className="mx-auto w-fit max-w-[50rem] text-left">
        <p className="manifesto-label font-inter mb-10 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
          {settings?.manifestoLabel || '( Our promise )'}
        </p>
        <p className="font-serif text-[clamp(1.3rem,2.8vw,2.6rem)] leading-[1.25] tracking-tight text-zinc-950">
          {lines.map((line, li) =>
            line.trim() === '' ? (
              // Blank line typed in the customizer = paragraph break
              <span key={li} className="block h-[0.7em]" aria-hidden="true" />
            ) : (
              <span key={li} className="block">
                {line
                  .trim()
                  .split(/\s+/)
                  .map((word, wi) => (
                    <span key={wi} className="manifesto-word">
                      {renderAccent(word)}{' '}
                    </span>
                  ))}
              </span>
            )
          )}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Decoration — full-bleed photo feature                              */
/* ------------------------------------------------------------------ */

export function DecorationSection({
  settings,
  onStart,
}: {
  settings?: StorefrontSettingsShape;
  onStart?: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.to('.decoration-media', {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
      gsap.from('.decoration-copy', {
        autoAlpha: 0,
        y: 40,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 70%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const img = settings?.decorationImageUrl || '/images/custom-apparel-hero.png';

  const rawTitle = settings?.decorationTitle || 'Better *Decoration*';
  let titleContent: React.ReactNode;
  if (rawTitle.includes('*')) {
    titleContent = renderAccentTitle(rawTitle);
  } else {
    const titleLines = splitTitleLines(rawTitle);
    titleContent = titleLines.map((line, i) => (
      <span key={i} className="block">
        <span className={i === titleLines.length - 1 ? 'italic font-light' : ''}>{line}</span>
      </span>
    ));
  }

  const btnText = settings?.decorationBtnText || 'Book a Consultation';
  const btnUrl = settings?.decorationBtnUrl?.trim();
  const btnClass =
    'font-inter mt-8 block w-fit cursor-pointer rounded-full bg-zinc-950 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-zinc-800';

  return (
    <section
      id="decoration"
      ref={sectionRef}
      className="relative min-h-[92svh] overflow-hidden bg-white text-zinc-950"
    >
      <div className="decoration-media absolute inset-[-7%] will-change-transform">
        <img
          src={img}
          alt={settings?.decorationTitle?.replace(/\*/g, '') || 'Better Decoration'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {/* Soft white wash so the ink type stays readable on any upload */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/20 to-transparent" />
      </div>

      <div className="decoration-copy relative z-10 flex min-h-[92svh] flex-col justify-center px-6 pt-24 pb-28 md:px-12">
        <h2 className="font-serif max-w-[7em] text-[clamp(3rem,7.5vw,8rem)] leading-[1.02] tracking-tight">
          {titleContent}
        </h2>
        <p className="font-inter mt-4 max-w-md text-xs font-light leading-relaxed text-zinc-800">
          {settings?.decorationBody ||
            'State-of-the-Art Design Studio — built to provide design solutions to level up your brand.'}
        </p>
        {btnUrl ? (
          <a data-cursor href={btnUrl} className={btnClass}>
            {btnText}
          </a>
        ) : (
          <button data-cursor onClick={() => onStart?.('types')} className={btnClass}>
            {btnText}
          </button>
        )}
      </div>

      {/* Bottom methods strip */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 md:px-12">
        <div className="border-t border-zinc-900/60 pt-3">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-900">
            {settings?.decorationFooterText ||
              'DTF · Screen Printing · Dye Sub · Embroidery · Vinyl'}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Interlude — big statement between decoration and the catalog       */
/* ------------------------------------------------------------------ */

export function InterludeSection({ settings }: { settings?: StorefrontSettingsShape }) {
  const sectionRef = useRef<HTMLElement>(null);
  const text =
    settings?.interludeText ||
    'Better blanks make better merch — every piece starts on a garment people actually want to wear.';
  const lines = text.split(/\r?\n/);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.set('.interlude-word', { opacity: 0.14 });
      gsap.to('.interlude-word', {
        opacity: 1,
        stagger: 0.04,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 75%',
          end: 'bottom 55%',
          scrub: 0.6,
        },
      });
      gsap.from('.interlude-label', {
        autoAlpha: 0,
        y: 20,
        duration: 0.8,
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [text]);

  return (
    <section id="interlude" ref={sectionRef} className="bg-white px-6 pt-10 pb-16 text-zinc-950 md:px-12 md:pt-12 md:pb-20">
      <div className="mx-auto w-fit max-w-[50rem] text-left">
        <p className="interlude-label font-inter mb-10 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
          {settings?.interludeLabel || '( What better looks like )'}
        </p>
        <p className="font-serif text-[clamp(1.3rem,2.8vw,2.6rem)] leading-[1.25] tracking-tight">
          {lines.map((line, li) =>
            line.trim() === '' ? (
              <span key={li} className="block h-[0.7em]" aria-hidden="true" />
            ) : (
              <span key={li} className="block">
                {line
                  .trim()
                  .split(/\s+/)
                  .map((word, wi) => (
                    <span key={wi} className="interlude-word">
                      {renderAccent(word)}{' '}
                    </span>
                  ))}
              </span>
            )
          )}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Showcase — pinned horizontal catalog gallery                       */
/* ------------------------------------------------------------------ */

const SHOWCASE_ITEMS = [
  { label: 'T-Shirts', src: '/images/categories/tshirts.png' },
  { label: 'Sweatshirts', src: '/images/categories/sweatshirts.png' },
  { label: 'Hats', src: '/images/categories/hats.png' },
  { label: 'Polos', src: '/images/categories/polos.png' },
  { label: 'Jackets', src: '/images/categories/jackets.png' },
  { label: 'Bags', src: '/images/categories/bags.png' },
];

export function ShowcaseSection({
  settings,
  onStart,
}: {
  settings?: StorefrontSettingsShape;
  onStart: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        desktop: '(min-width: 1024px)',
        reduce: '(prefers-reduced-motion: reduce)',
      },
      (ctx) => {
        const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
        if (!desktop || reduce) return;
        const track = trackRef.current;
        const section = sectionRef.current;
        if (!track || !section) return;

        // The whole track — title rail included — travels until the last card
        // reaches the right edge.
        const getShift = () =>
          Math.max(0, track.scrollWidth - (window.innerWidth - track.offsetLeft));

        gsap.to(track, {
          x: () => -getShift(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${getShift()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
      }
    );
    return () => mm.revert();
  }, []);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (pointerStartRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y
      );
      if (dist > 10) return; // User dragged/swiped to scroll, ignore click
    }
    onStart('types');
  };

  const rawTitle = settings?.showcaseTitle || 'Built on premium blanks';
  let titleContent: React.ReactNode;
  if (rawTitle.includes('*')) {
    titleContent = renderAccentTitle(rawTitle);
  } else {
    const titleLines = splitTitleLines(rawTitle);
    titleContent = titleLines.map((line, i) => (
      <span key={i} className="block">
        <span className={i === titleLines.length - 1 ? 'italic font-light' : ''}>{line}</span>
      </span>
    ));
  }

  // Rendered twice — stacked above the cards on mobile, inside the track on desktop
  const renderRail = () => (
    <>
      <p className="font-inter mb-5 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
        {settings?.showcaseLabel || '( The catalog )'}
      </p>
      <h2 className="font-serif text-[clamp(2.4rem,7.5vw,8rem)] leading-[0.98] tracking-tight">
        {titleContent}
      </h2>
      <p className="font-inter mt-5 max-w-[19rem] text-xs font-light leading-relaxed text-zinc-300">
        {settings?.showcaseSubtitle || '1 of 1 Blanks that set your brand apart.'}
      </p>
      <span className="font-inter mt-5 flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-300 lg:hidden">
        Swipe sideways <ArrowRight size={11} className="text-amber-400" />
      </span>
    </>
  );

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-zinc-950 text-[#faf9f5]">
      <div className="flex flex-col px-6 pt-20 pb-10 md:px-12 lg:h-[calc(100svh_-_64px)] lg:flex-row lg:items-center lg:pt-0 lg:pb-0">
        {/* Mobile: the rail sits above the cards so scroll-snap can't hide it */}
        <div className="mb-8 lg:hidden">{renderRail()}</div>

        {/* Card track — on desktop the title rail rides along with the cards */}
        <div
          ref={trackRef}
          className="flex items-center overflow-x-auto gap-4 pb-2 scrollbar-none md:gap-5 lg:w-max lg:overflow-visible lg:pr-12 snap-x snap-mandatory lg:snap-none"
          style={{
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            overscrollBehaviorX: 'contain',
          }}
        >
          {/* Title rail (desktop) */}
          <div className="hidden shrink-0 lg:block lg:w-[26vw] lg:pr-10">{renderRail()}</div>

        {SHOWCASE_ITEMS.map((item, i) => {
          const cardImg = settings?.showcaseImages?.[item.label] || item.src;
          const cardHoverImg = settings?.showcaseHoverImages?.[item.label];
          const cardBadge = settings?.showcaseBadges?.[item.label] || settings?.showcaseBadge || 'Good · Better · Best';
          return (
            <button
              key={item.label}
              data-cursor
              onPointerDown={handlePointerDown}
              onClick={handleCardClick}
              className="showcase-card group relative aspect-square w-[78vw] shrink-0 cursor-pointer overflow-hidden rounded-xl bg-zinc-900 text-left snap-start lg:snap-align-none sm:w-[52vw] lg:h-[62vh] lg:w-auto"
            >
              <img
                src={cardImg}
                alt={`Custom ${item.label.toLowerCase()}`}
                className="h-full w-full object-cover opacity-100 transition-transform duration-500 ease-in-out group-hover:scale-105"
                loading="lazy"
              />
              {cardHoverImg && (
                <img
                  src={cardHoverImg}
                  alt={`Custom ${item.label.toLowerCase()} hover`}
                  className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-500 ease-in-out group-hover:opacity-100 group-hover:scale-105"
                  loading="lazy"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />
              <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5 pointer-events-none">
                <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-inter rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-100 backdrop-blur-md shadow-sm">
                  {cardBadge}
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 pointer-events-none">
                <span className="font-serif text-3xl tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)] lg:text-4xl">{item.label}</span>
                <span className="font-inter flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-100 opacity-0 transition-opacity duration-300 group-hover:opacity-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  Start here <ArrowRight size={12} />
                </span>
              </div>
          </button>
        );
      })}

        {/* Terminal card — full rack CTA */}
        <button
          data-cursor
          onPointerDown={handlePointerDown}
          onClick={handleCardClick}
          className="group relative flex aspect-square w-[78vw] shrink-0 cursor-pointer flex-col items-start justify-between overflow-hidden rounded-xl border border-white/15 bg-white p-6 text-left text-zinc-950 snap-start lg:snap-align-none sm:w-[52vw] lg:h-[62vh] lg:w-auto"
        >
          <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-zinc-400">
            {String(SHOWCASE_ITEMS.length + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 className="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">
              {(() => {
                const titleStr = settings?.rackCardTitle || 'Or design the *entire rack* at once.';
                if (titleStr.includes('*')) {
                  const parts = titleStr.split('*');
                  return parts.map((part, idx) =>
                    idx % 2 === 1 ? (
                      <span key={idx} className="italic font-light">
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  );
                }
                if (titleStr.toLowerCase().includes('entire rack')) {
                  const index = titleStr.toLowerCase().indexOf('entire rack');
                  const before = titleStr.slice(0, index);
                  const match = titleStr.slice(index, index + 11);
                  const after = titleStr.slice(index + 11);
                  return (
                    <>
                      {before}
                      <span className="italic font-light">{match}</span>
                      {after}
                    </>
                  );
                }
                return titleStr;
              })()}
            </h3>
            <p className="font-inter mt-4 max-w-xs text-xs font-light leading-relaxed text-zinc-500">
              {settings?.rackCardBody ||
                'Hat, tee, polo, crewneck, hoodie and long sleeve — one cohesive collection, your branding on every piece.'}
            </p>
          </div>
          <span className="font-inter flex items-center gap-3 rounded-full bg-zinc-950 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-colors group-hover:bg-zinc-800">
            {settings?.rackCardBtnText || 'Design a cohesive line'} <ArrowRight size={13} />
          </span>
        </button>
        </div>
      </div>

      {/* Bottom category strip */}
      <div className="relative z-10 border-t border-white/15 px-6 py-5 md:px-12">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          {settings?.showcaseFooterText ||
            'T-Shirt · Long Sleeve · Sweatshirts · Hats · Jackets · Accessories'}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Finish — "One logo, every finish" copy + big photo                 */
/* ------------------------------------------------------------------ */

export function FinishSection({
  settings,
  onStart,
}: {
  settings?: StorefrontSettingsShape;
  onStart: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.from('.finish-copy', {
        autoAlpha: 0,
        y: 40,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
      });
      gsap.fromTo(
        '.finish-photo img',
        { scale: 1.12 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.finish-photo',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const img = settings?.finishImageUrl || '/images/blank_basics_hero.png';

  return (
    <section id="finish" ref={sectionRef} className="bg-white px-6 pt-14 md:px-12 md:pt-20">
      <div className="finish-copy mx-auto w-fit max-w-[50rem] text-left">
        <p className="font-inter mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
          {settings?.finishLabel || '( One logo )'}
        </p>
        <h2 className="font-serif text-[clamp(1.3rem,2.8vw,2.6rem)] leading-[1.25] tracking-tight text-zinc-950">
          {renderAccentTitle(settings?.finishTitle || 'One logo — *every finish*')}
        </h2>
        {settings?.finishBody !== '' && (
          <p className="font-inter mt-4 max-w-xl text-xs font-light leading-relaxed text-zinc-500">
            {settings?.finishBody ||
              'Upload your logo once. We match it across print, puff and stitch so every piece on the rack looks like family.'}
          </p>
        )}
      </div>

      <button
        data-cursor
        onClick={() => onStart('types')}
        className="finish-photo relative -mx-6 mt-12 block h-[70svh] w-[calc(100%_+_3rem)] cursor-pointer overflow-hidden md:-mx-12 md:mt-16 md:h-[88svh] md:w-[calc(100%_+_6rem)]"
      >
        <img
          src={img}
          alt={settings?.finishTitle?.replace(/\*/g, '') || 'One logo — every finish'}
          className="h-full w-full object-cover will-change-transform"
          loading="lazy"
        />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Standard — statement band + full-bleed certification feature       */
/* ------------------------------------------------------------------ */

export function StandardSection({ settings }: { settings?: StorefrontSettingsShape }) {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.from('.standard-statement', {
        autoAlpha: 0,
        y: 30,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
      });
      gsap.to('.standard-media', {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: '.standard-panel',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      });
      gsap.from('.standard-copy', {
        autoAlpha: 0,
        y: 40,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.standard-panel', start: 'top 70%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const img = settings?.standardImageUrl || '/images/blank_basics_hero.png';
  const rawTitle = settings?.standardTitle || 'Non-toxic\n*Certified*';
  const titleLines = rawTitle.split(/\r?\n/);
  const badge = settings?.standardBadgeImageUrl?.trim();

  return (
    <section id="standard" ref={sectionRef} className="bg-white">
      {/* Statement band */}
      <div className="px-6 pt-10 pb-16 md:px-12 md:pt-12 md:pb-20">
        <div className="standard-statement mx-auto w-fit max-w-[50rem] text-left">
          <p className="font-inter mb-6 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
            {settings?.standardLabel || '( Our standard )'}
          </p>
          <p className="font-serif text-[clamp(1.3rem,2.8vw,2.6rem)] leading-[1.25] tracking-tight text-zinc-950">
            {renderAccent(settings?.standardStatement || 'What touches the garment matters.')}
          </p>
        </div>
      </div>

      {/* Full-bleed certification panel */}
      <div className="standard-panel relative min-h-[88svh] overflow-hidden bg-zinc-900 text-white">
        <div className="standard-media absolute inset-[-7%] will-change-transform">
          <img
            src={img}
            alt={rawTitle.replace(/\*/g, '').replace(/\n/g, ' ')}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* Keeps the white type legible over any upload */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
        </div>

        <div className="standard-copy relative z-10 flex min-h-[88svh] flex-col justify-center px-6 pt-24 pb-28 md:px-12">
          <h2 className="font-serif text-[clamp(3rem,7.5vw,8rem)] leading-[1.02] tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
            {titleLines.map((line, i) => (
              <span key={i} className="block">
                {renderAccentTitle(line)}
                {i === 0 && badge && (
                  <img
                    src={badge}
                    alt=""
                    className="ml-2 inline-block h-[0.32em] w-[0.32em] align-top object-contain"
                  />
                )}
              </span>
            ))}
          </h2>
          <p className="font-inter mt-6 max-w-md text-xs font-light leading-relaxed text-zinc-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {settings?.standardBody || "Better Decoration shouldn't come with a toxic tradeoff"}
          </p>
        </div>

        {/* Bottom credentials strip */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 md:px-12">
          <div className="border-t border-white/40 pt-3">
            <p className="font-inter text-[10px] font-medium uppercase tracking-[0.25em] text-white">
              {settings?.standardFooterText ||
                'Inks · Threads · Production · Air Quality · Press · Fabrics'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Process — numbered editorial rows                                  */
/* ------------------------------------------------------------------ */

export function ProcessSection({ settings }: { settings?: StorefrontSettingsShape }) {
  const sectionRef = useRef<HTMLElement>(null);

  const steps = [
    {
      title: settings?.processStep1Title || 'Design',
      body: settings?.processStep1Body || 'Pick a themed rack or start from premium blanks. Your logo is placed instantly — move it, scale it, see it live on every garment.',
    },
    {
      title: settings?.processStep2Title || 'Quote',
      body: settings?.processStep2Body || 'Submit your build with sizes and dates. Our team reviews every detail and returns a formal quote — no guesswork, no hidden fees.',
    },
    {
      title: settings?.processStep3Title || 'Approve',
      body: settings?.processStep3Body || 'Create your account, approve your proof, and follow every status change from your client portal — current and future orders in one place.',
    },
    {
      title: settings?.processStep4Title || 'Production',
      body: settings?.processStep4Body || 'Printed, pressed and embroidered in-house, quality-checked piece by piece, and tracked from press to porch.',
    },
  ];

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.utils.toArray<HTMLElement>('.process-row').forEach((row) => {
        gsap.from(row, {
          autoAlpha: 0,
          y: 40,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: row, start: 'top 85%' },
        });
      });
      gsap.from('.process-heading', {
        autoAlpha: 0,
        y: 30,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 78%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="process" ref={sectionRef} className="bg-white px-6 py-28 md:px-12 md:py-40">
      <div className="mx-auto max-w-7xl">
        <div className="process-heading mb-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-inter mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
              {settings?.processLabel || '( The process )'}
            </p>
            <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-none tracking-tight text-zinc-950">
              {settings?.processTitle || (
                <>From logo to <span className="italic font-light">loading dock</span></>
              )}
            </h2>
          </div>
          <p className="font-inter max-w-xs text-xs font-light leading-relaxed text-zinc-500">
            {settings?.processSubtitle || 'Four steps. One portal. A human checks every order before it ever hits a press.'}
          </p>
        </div>

        <div className="border-t border-zinc-200">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="process-row grid cursor-default grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 border-b border-zinc-200 px-2 py-8 md:grid-cols-[8rem_1fr_24rem] md:gap-x-12 md:px-6 md:py-10"
            >
              <span className="process-muted font-mono text-xs font-semibold tracking-[0.3em] text-zinc-400">
                ({String(i + 1).padStart(2, '0')})
              </span>
              <h3 className="process-ink font-serif text-3xl tracking-tight text-zinc-950 md:text-5xl">
                {step.title}
              </h3>
              <p className="process-muted font-inter col-span-2 text-sm font-light leading-relaxed text-zinc-500 md:col-span-1">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Start CTA — the two flow entrances                                 */
/* ------------------------------------------------------------------ */

export function StartCTASection({
  settings,
  onStart,
}: {
  settings?: StorefrontSettingsShape;
  onStart: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      gsap.from('.cta-panel', {
        autoAlpha: 0,
        y: 60,
        duration: 1,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const title = settings?.ctaCardTitle?.trim() || 'Better\n*People*';
  const titleLines = title.split(/\r?\n/);
  const body = settings?.ctaCardBody?.trim() || 'Tech forward - powered by the Human element.';
  const img = settings?.ctaCardImageUrl || '/images/apparel_rack_hero.png';
  const mobileImg = settings?.ctaCardMobileImageUrl || undefined;

  return (
    <section id="start-cta" ref={sectionRef} className="bg-zinc-950">
      {settings?.showCtaHeading && (
        <div className="px-6 pt-16 pb-6 text-center sm:pt-20 sm:pb-10 md:px-12 md:pt-28">
          <p className="font-inter mb-3 sm:mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {settings?.ctaSectionLabel || '( Choose your path )'}
          </p>
          <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-none tracking-tight text-[#faf9f5]">
            {settings?.ctaSectionTitle || (
              <>Start <span className="italic font-light">designing</span></>
            )}
          </h2>
        </div>
      )}

      <div
        data-cursor
        onClick={() => onStart('types')}
        className="cta-panel group relative min-h-[88svh] cursor-pointer overflow-hidden bg-zinc-950 text-white"
      >
        <div className="absolute inset-0 overflow-hidden">
          {mobileImg ? (
            <picture className="contents">
              <source media="(max-width: 639px)" srcSet={mobileImg} />
              <img
                src={img}
                alt={title.replace(/\*/g, '').replace(/\n/g, ' ')}
                className="h-full w-full object-cover object-left sm:object-center"
                loading="lazy"
              />
            </picture>
          ) : (
            <img
              src={img}
              alt={title.replace(/\*/g, '').replace(/\n/g, ' ')}
              className="h-full w-full object-cover object-left sm:object-center"
              loading="lazy"
            />
          )}
          {/* Keeps the white type legible over any upload */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />
        </div>

        <div className="relative z-10 flex min-h-[88svh] flex-col justify-center px-6 pt-24 pb-28 md:px-12">
          <h2 className="font-serif text-[clamp(3rem,7.5vw,8rem)] leading-[1.02] tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
            {titleLines.map((line, i) => (
              <span key={i} className="block">
                {renderAccentTitle(line)}
              </span>
            ))}
          </h2>
          <p className="font-inter mt-6 max-w-md text-xs font-light leading-relaxed text-zinc-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {body}
          </p>

          {settings?.showCtaButtons && (
            <div className="mt-8 flex flex-col items-start gap-3">
              <span className="font-inter flex w-fit items-center gap-3 rounded-full bg-white px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors group-hover:bg-zinc-200">
                {settings?.ctaCardBtnText || 'Start designing'}
                <ArrowRight size={14} className="cta-arrow" />
              </span>
              {settings?.showGalleryNav !== false && (
                <a
                  data-cursor
                  href="/gallery"
                  onClick={(e) => e.stopPropagation()}
                  className="font-inter flex w-fit items-center gap-3 rounded-full border border-white/40 bg-black/30 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-sm backdrop-blur-md transition-all hover:border-white hover:bg-white/20"
                >
                  Explore Lookbook Gallery
                  <ArrowRight size={14} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Bottom capabilities strip */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 md:px-12">
          <div className="border-t border-white/40 pt-3">
            <p className="font-inter text-[10px] font-medium uppercase tracking-[0.25em] text-white">
              {settings?.ctaFooterText ||
                'Designers · Platform UI · Kitting · Managers · Shipping · Logistics · Sales · Client Support'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                             */
/* ------------------------------------------------------------------ */

function NewsletterForm({ settings }: { settings: StorefrontSettingsShape }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setStatus('sending');
    try {
      await addDoc(collection(db, 'newsletter_signups'), {
        email: trimmed,
        source: 'landing-footer',
        createdAt: serverTimestamp(),
      });
      setStatus('done');
      setEmail('');
    } catch (err) {
      console.error('Newsletter signup failed:', err);
      // Fall back to a pre-filled email so the signup is never lost
      if (settings.email) {
        window.location.href = `mailto:${settings.email}?subject=${encodeURIComponent(
          'Subscribe me to ' + (settings.subscribeTitle || 'Theory Trends')
        )}&body=${encodeURIComponent('Please add ' + trimmed + ' to the list.')}`;
      }
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <p className="font-inter flex items-center gap-2 text-sm font-light text-emerald-400">
        <Check size={15} /> You're on the list.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-lg bg-white py-1 pl-5 pr-2"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        className="font-inter min-w-0 flex-1 bg-transparent py-2.5 text-sm font-light text-zinc-900 placeholder:text-zinc-400 outline-none"
      />
      <button
        data-cursor
        type="submit"
        disabled={status === 'sending'}
        className="font-inter flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
      >
        {status === 'sending' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          settings.subscribeBtnText || 'Subscribe'
        )}
      </button>
    </form>
  );
}

/** "Label | /path" per line → quicklink list. */
function parseQuicklinks(raw?: string) {
  return (raw || '')
    .split(/\r?\n/)
    .map((line) => {
      const [label, href] = line.split('|').map((p) => p.trim());
      return label ? { label, href: href || '#' } : null;
    })
    .filter((x): x is { label: string; href: string } => x !== null);
}

const DEFAULT_QUICKLINKS = [
  { label: 'Our Story', href: '#manifesto' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Client Portal', href: '/portal' },
  { label: 'Shop', href: '/shop' },
  { label: 'Contact', href: '#' },
];

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.66l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.11z" />
    </svg>
  );
}

export function LandingFooter({
  settings,
  currentTime,
  isClient,
  onPortal,
  onLogin,
  onStart,
  hasUser,
}: {
  settings: StorefrontSettingsShape;
  currentTime: string;
  isClient: boolean;
  hasUser: boolean;
  onPortal: () => void;
  onLogin: () => void;
  onScrollTo?: (id: string) => void;
  onStart: (mode?: 'racks' | 'basics' | 'types') => void;
}) {
  const year = new Date().getFullYear();
  const quicklinks = (() => {
    const parsed = parseQuicklinks(settings.footerQuicklinks);
    return parsed.length ? parsed : DEFAULT_QUICKLINKS;
  })();
  const aboutBlocks = (settings.footerAbout || '')
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const copyright = (
    settings.footerCopyright ||
    `© {year} ${settings.logoText} | ${settings.email || ''}`
  ).replace(/\{year\}/g, String(year));
  // An uploaded strip wins; otherwise the bundled marks ship by default, so a
  // stale empty value in saved settings can't blank them out.
  const paymentImg = settings.footerPaymentImageUrl?.trim() || '/images/payment-marks.png';

  const socials = [
    { url: settings.footerFacebookUrl, node: <Facebook size={15} />, label: 'Facebook' },
    { url: settings.footerXUrl, node: <XIcon />, label: 'X' },
    { url: settings.footerInstagramUrl, node: <Instagram size={15} />, label: 'Instagram' },
  ].filter((s) => s.url && s.url.trim() !== '');

  const linkCls = 'font-inter cursor-pointer text-sm text-zinc-300 transition-colors hover:text-white';

  return (
    <footer className="w-full bg-zinc-950 px-6 pt-20 pb-10 text-[#faf9f5] md:px-12">
      <div className="w-full">
        <div className="grid gap-14 lg:grid-cols-[1.15fr_1fr]">
          {/* Left — wordmark + about */}
          <div>
            {settings.logoImageUrl ? (
              <img
                src={settings.logoImageUrl}
                alt={settings.logoText || 'Logo'}
                className="h-14 max-w-[280px] object-contain"
              />
            ) : settings.logoText === 'INKTHEORY' ? (
              <h2 className="footer-brand font-sans text-[clamp(2.5rem,6vw,4.5rem)] font-black leading-none tracking-tighter uppercase">
                INKTHEORY
              </h2>
            ) : (
              <h2 className="footer-brand font-serif text-[clamp(2.5rem,6vw,4.5rem)] font-normal leading-none tracking-tight">
                {settings.logoText}
              </h2>
            )}

            {aboutBlocks.length > 0 && (
              <div className="font-inter mt-8 flex max-w-xl flex-col gap-5 text-sm font-light leading-relaxed text-zinc-300">
                {aboutBlocks.map((block, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {block}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Right — quicklinks + newsletter */}
          <div className="flex flex-col gap-12 lg:items-end lg:text-right">
            <div>
              <p className="font-inter mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
                Quicklinks
              </p>
              <div className="flex flex-col items-start gap-2.5 lg:items-end">
                {quicklinks.map((link) =>
                  link.href === '/portal' ? (
                    <button
                      key={link.label}
                      data-cursor
                      onClick={isClient ? onPortal : onLogin}
                      className={linkCls}
                    >
                      {link.label}
                    </button>
                  ) : link.href === 'start' ? (
                    <button key={link.label} data-cursor onClick={() => onStart('types')} className={linkCls}>
                      {link.label}
                    </button>
                  ) : (
                    <a key={link.label} data-cursor href={link.href} className={linkCls}>
                      {link.label}
                    </a>
                  )
                )}
                {!hasUser && (
                  <button data-cursor onClick={onLogin} className={linkCls}>
                    Create an account
                  </button>
                )}
              </div>
            </div>

            {settings.showSubscribe !== false && (
              <div className="w-full lg:max-w-md">
                <p className="font-inter mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400">
                  {settings.subscribeTitle || 'Theory Trends'}
                </p>
                <p className="font-inter mb-4 text-sm font-light leading-relaxed text-zinc-300 whitespace-pre-line">
                  {settings.subscribeBody ||
                    'Give your brand the edge.\nSubscribe to get notified on our latest products and trends.'}
                </p>
                <NewsletterForm settings={settings} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom band — socials / certified badge / payment marks */}
        <div className="mt-16 grid gap-10 md:grid-cols-3 md:items-end">
          <div className="flex flex-col gap-5">
            {socials.length > 0 && (
              <div className="flex items-center gap-3">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    data-cursor
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-colors hover:bg-white hover:text-zinc-950"
                  >
                    {s.node}
                  </a>
                ))}
              </div>
            )}
            <p className="font-inter text-xs font-light text-zinc-400">{copyright}</p>
          </div>

          {settings.showFooterBadge !== false && (
            <div className="flex justify-start md:justify-center">
              {settings.footerBadgeImageUrl ? (
                <img
                  src={settings.footerBadgeImageUrl}
                  alt="Certified badge"
                  className="h-16 object-contain"
                />
              ) : (
                <div className="font-inter text-center leading-none text-zinc-300">
                  <span className="block rotate-180 text-[9px] font-semibold tracking-[0.25em]">
                    {settings.footerBadgeTopText || 'NM ORIGINAL'}
                  </span>
                  <span className="mt-1.5 block text-xl font-light tracking-[0.2em]">
                    {settings.footerBadgeMainText || 'NO. 505'}
                  </span>
                  <span className="mt-1.5 block text-[8px] font-semibold tracking-[0.35em] text-zinc-500">
                    {settings.footerBadgeSubText || 'CERTIFIED'}
                  </span>
                </div>
              )}
            </div>
          )}

          {settings.showPaymentMarks !== false && (
            <div className="flex md:justify-end">
              <img
                src={paymentImg}
                alt="Accepted payment methods"
                className="h-6 max-w-full object-contain object-left md:object-right"
              />
            </div>
          )}
        </div>

        <p className="font-inter mt-10 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
          Local time {currentTime || '00:00:00'}
        </p>
      </div>
    </footer>
  );
}
