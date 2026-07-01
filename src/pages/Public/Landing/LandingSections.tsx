import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ArrowDown } from 'lucide-react';
import type { StorefrontSettingsShape } from './ImmersiveLanding';

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

const HERO_SLIDES = [
  { src: '/images/apparel_rack_hero.png', alt: 'Custom apparel rack' },
  { src: '/images/custom-apparel-hero.png', alt: 'Custom apparel detail' },
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
}: {
  settings: StorefrontSettingsShape;
  introPlay: boolean;
  onScrollTo: (id: string) => void;
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
      {/* Slideshow media */}
      <div className="hero-media absolute inset-0 will-change-transform">
        {HERO_SLIDES.map((slide, i) => (
          <div
            key={slide.src}
            className={`absolute inset-0 overflow-hidden transition-opacity duration-[1400ms] ease-in-out ${
              i === slideIdx ? 'opacity-100 hero-slide-active' : 'opacity-0'
            }`}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/35 to-zinc-950/45" />
      </div>

      {/* Content */}
      <div className="hero-content relative z-10 flex h-full flex-col justify-end px-6 pb-10 md:px-12 md:pb-14">
        <div className="hero-fade-in font-inter mb-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Design portals open — custom merch, made properly
        </div>

        <h1 className="font-serif font-normal leading-[0.98] tracking-tight text-[clamp(3rem,9.5vw,9rem)]">
          {lines.map((line, i) => (
            <span key={i} className="hero-line">
              <span className={i === lines.length - 1 ? 'italic font-light' : ''}>
                {line}
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="hero-fade-in font-inter max-w-md text-sm font-light leading-relaxed text-zinc-300">
            {settings.heroSubtitle ||
              'Choose a themed collection to design a cohesive line, or start from our curated basics.'}
          </p>

          <div className="hero-fade-in flex items-center gap-3">
            <button
              data-cursor
              onClick={() => onScrollTo('#start-cta')}
              className="font-inter group flex cursor-pointer items-center gap-3 rounded-full bg-white px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Start your project
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              data-cursor
              onClick={() => onScrollTo('#process')}
              className="font-inter cursor-pointer rounded-full border border-white/30 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:border-white hover:bg-white/10"
            >
              How it works
            </button>
          </div>
        </div>

        {/* Bottom meta row */}
        <div className="hero-fade-in font-inter mt-10 flex items-center justify-between border-t border-white/15 pt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          <span className="hidden md:inline">Print · Embroidery · Cut &amp; Sew</span>
          <span className="flex items-center gap-2">
            <ArrowDown size={12} className="animate-bounce" />
            Scroll
          </span>
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

export function ManifestoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const words = MANIFESTO.split(' ');

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
  }, []);

  return (
    <section ref={sectionRef} className="bg-[#faf9f5] px-6 py-28 md:px-12 md:py-44">
      <div className="mx-auto max-w-5xl">
        <p className="manifesto-label font-inter mb-10 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
          ( Our promise )
        </p>
        <p className="font-serif text-[clamp(1.6rem,3.6vw,3.4rem)] leading-[1.25] tracking-tight text-zinc-950">
          {words.map((word, i) => (
            <span key={i} className="manifesto-word">
              {word}{' '}
            </span>
          ))}
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

export function ShowcaseSection({ onStart }: { onStart: (mode: 'racks' | 'basics') => void }) {
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

        gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${track.scrollWidth - window.innerWidth}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
      }
    );
    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} className="overflow-hidden bg-zinc-950 text-[#faf9f5]">
      <div className="flex items-end justify-between px-6 pt-20 pb-10 md:px-12 md:pt-28">
        <div>
          <p className="font-inter mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            ( The catalog )
          </p>
          <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-none tracking-tight">
            Built on <span className="italic font-light">premium</span> blanks
          </h2>
        </div>
        <p className="font-inter hidden max-w-xs text-xs font-light leading-relaxed text-zinc-400 md:block">
          Every category is curated Good / Better / Best — compare options side by side, then make
          them yours.
        </p>
      </div>

      <div
        ref={trackRef}
        className="flex w-max gap-5 overflow-x-auto px-6 pb-20 md:px-12 md:pb-28 lg:overflow-visible"
        style={{ scrollbarWidth: 'none' }}
      >
        {SHOWCASE_ITEMS.map((item, i) => (
          <button
            key={item.label}
            data-cursor
            onClick={() => onStart('racks')}
            className="showcase-card group relative h-[52vh] w-[72vw] shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 text-left sm:w-[44vw] lg:h-[58vh] lg:w-[30vw]"
          >
            <img
              src={item.src}
              alt={`Custom ${item.label.toLowerCase()}`}
              className="h-full w-full object-cover opacity-90"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-zinc-950/20" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-zinc-300">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-inter rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-200 backdrop-blur-sm">
                Good · Better · Best
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
              <span className="font-serif text-3xl tracking-tight lg:text-4xl">{item.label}</span>
              <span className="font-inter flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Start here <ArrowRight size={12} />
              </span>
            </div>
          </button>
        ))}

        {/* Terminal card — full rack CTA */}
        <button
          data-cursor
          onClick={() => onStart('racks')}
          className="group relative flex h-[52vh] w-[72vw] shrink-0 cursor-pointer flex-col items-start justify-between overflow-hidden rounded-2xl border border-white/15 bg-[#faf9f5] p-6 text-left text-zinc-950 sm:w-[44vw] lg:h-[58vh] lg:w-[30vw]"
        >
          <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-zinc-400">
            {String(SHOWCASE_ITEMS.length + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 className="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">
              Or design the <span className="italic font-light">entire rack</span> at once.
            </h3>
            <p className="font-inter mt-4 max-w-xs text-xs font-light leading-relaxed text-zinc-500">
              Hat, tee, polo, crewneck, hoodie and long sleeve — one cohesive collection, your
              branding on every piece.
            </p>
          </div>
          <span className="font-inter flex items-center gap-3 rounded-full bg-zinc-950 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white transition-colors group-hover:bg-zinc-800">
            Design a cohesive line <ArrowRight size={13} />
          </span>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Process — numbered editorial rows                                  */
/* ------------------------------------------------------------------ */

const PROCESS_STEPS = [
  {
    title: 'Design',
    body: 'Pick a themed rack or start from premium blanks. Your logo is placed instantly — move it, scale it, see it live on every garment.',
  },
  {
    title: 'Quote',
    body: 'Submit your build with sizes and dates. Our team reviews every detail and returns a formal quote — no guesswork, no hidden fees.',
  },
  {
    title: 'Approve',
    body: 'Create your account, approve your proof, and follow every status change from your client portal — current and future orders in one place.',
  },
  {
    title: 'Production',
    body: 'Printed, pressed and embroidered in-house, quality-checked piece by piece, and tracked from press to porch.',
  },
];

export function ProcessSection() {
  const sectionRef = useRef<HTMLElement>(null);

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
    <section id="process" ref={sectionRef} className="bg-[#faf9f5] px-6 py-28 md:px-12 md:py-40">
      <div className="mx-auto max-w-7xl">
        <div className="process-heading mb-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-inter mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">
              ( The process )
            </p>
            <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-none tracking-tight text-zinc-950">
              From logo to <span className="italic font-light">loading dock</span>
            </h2>
          </div>
          <p className="font-inter max-w-xs text-xs font-light leading-relaxed text-zinc-500">
            Four steps. One portal. A human checks every order before it ever hits a press.
          </p>
        </div>

        <div className="border-t border-zinc-200">
          {PROCESS_STEPS.map((step, i) => (
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

export function StartCTASection({ onStart }: { onStart: (mode: 'racks' | 'basics') => void }) {
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

  const panels = [
    {
      mode: 'racks' as const,
      num: '01',
      badge: 'Cohesive collection',
      title: 'Design Your Rack',
      body: 'Configure a unified apparel collection with our standard 6-item rack — hat, tee, polo, crewneck, hoodie and long sleeve — all overlayed with your branding instantly.',
      cta: 'Design a cohesive line',
      img: '/images/apparel_rack_hero.png',
      dark: true,
    },
  ];

  return (
    <section id="start-cta" ref={sectionRef} className="bg-zinc-950">
      <div className="px-6 pt-20 pb-10 text-center md:px-12 md:pt-28">
        <p className="font-inter mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          ( Choose your path )
        </p>
        <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-none tracking-tight text-[#faf9f5]">
          Start <span className="italic font-light">designing</span>
        </h2>
      </div>

      <div className="flex flex-col gap-px lg:flex-row">
        {panels.map((panel) => (
          <div
            key={panel.mode}
            data-cursor
            onClick={() => onStart(panel.mode)}
            className={`cta-panel group relative min-h-[70vh] flex-1 cursor-pointer overflow-hidden ${
              panel.dark ? 'bg-zinc-950 text-white' : 'bg-[#faf9f5] text-zinc-950'
            }`}
          >
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={panel.img}
                alt={panel.title}
                className={`h-full w-full object-cover ${panel.dark ? 'opacity-80' : 'opacity-90'}`}
                loading="lazy"
              />
              <div
                className={`absolute inset-0 ${
                  panel.dark
                    ? 'bg-gradient-to-t from-zinc-950 via-zinc-950/55 to-zinc-950/25'
                    : 'bg-gradient-to-t from-[#faf9f5] via-[#faf9f5]/60 to-transparent'
                }`}
              />
            </div>

            <div className="relative z-10 flex h-full min-h-[70vh] flex-col justify-between p-8 md:p-12">
              <div className="flex items-start justify-between">
                <span
                  className={`font-mono text-[10px] font-semibold tracking-[0.3em] uppercase ${
                    panel.dark ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {panel.num} / {panel.title}
                </span>
                <span
                  className={`font-inter rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm ${
                    panel.dark
                      ? 'border-white/20 bg-white/5 text-zinc-300'
                      : 'border-zinc-300 bg-zinc-950/5 text-zinc-600'
                  }`}
                >
                  {panel.badge}
                </span>
              </div>

              <div className="max-w-lg">
                <h3 className="font-serif text-4xl tracking-tight md:text-5xl">{panel.title}</h3>
                <p
                  className={`font-inter mt-4 text-sm font-light leading-relaxed ${
                    panel.dark ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {panel.body}
                </p>
                <span
                  className={`font-inter mt-8 flex w-fit items-center gap-3 rounded-full px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
                    panel.dark
                      ? 'bg-white text-zinc-950 group-hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white group-hover:bg-zinc-800'
                  }`}
                >
                  {panel.cta}
                  <ArrowRight size={14} className="cta-arrow" />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                             */
/* ------------------------------------------------------------------ */

export function LandingFooter({
  settings,
  currentTime,
  isClient,
  onPortal,
  onLogin,
  onScrollTo,
  hasUser,
}: {
  settings: StorefrontSettingsShape;
  currentTime: string;
  isClient: boolean;
  hasUser: boolean;
  onPortal: () => void;
  onLogin: () => void;
  onScrollTo: (id: string) => void;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-zinc-950 px-6 pt-24 pb-10 text-[#faf9f5] md:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-12 border-b border-white/10 pb-16 md:flex-row md:items-end md:justify-between">
          <h2 className="footer-brand font-serif text-[clamp(3rem,11vw,11rem)] font-normal tracking-tight">
            {settings.logoText}
          </h2>
          <div className="font-inter flex flex-col gap-3 text-sm font-light text-zinc-400">
            {settings.email && (
              <a
                data-cursor
                href={`mailto:${settings.email}`}
                className="transition-colors hover:text-white"
              >
                {settings.email}
              </a>
            )}
            {settings.contactPhone && (
              <a
                data-cursor
                href={`tel:${settings.contactPhone}`}
                className="transition-colors hover:text-white"
              >
                {settings.contactPhone}
              </a>
            )}
          </div>
        </div>

        <div className="font-inter flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em]">
            <button
              data-cursor
              onClick={() => onScrollTo('#start-cta')}
              className="cursor-pointer text-zinc-300 transition-colors hover:text-white"
            >
              Start a project
            </button>
            <button
              data-cursor
              onClick={isClient ? onPortal : onLogin}
              className="cursor-pointer text-zinc-300 transition-colors hover:text-white"
            >
              Client portal
            </button>
            {!hasUser && (
              <button
                data-cursor
                onClick={onLogin}
                className="cursor-pointer text-zinc-300 transition-colors hover:text-white"
              >
                Create an account
              </button>
            )}
          </div>
          <div className="flex items-center gap-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            <span>Local time {currentTime || '00:00:00'}</span>
            <span>
              © {year} {settings.logoText}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
