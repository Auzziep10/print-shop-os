import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  HeroSection,
  AnnouncementMarquee,
  ManifestoSection,
  ShowcaseSection,
  ProcessSection,
  StartCTASection,
  LandingFooter,
} from './LandingSections';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

export interface StorefrontSettingsShape {
  logoText: string;
  announcement?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  contactPhone?: string;
  email?: string;
}

export interface ImmersiveLandingProps {
  settings: StorefrontSettingsShape;
  user: object | null | undefined;
  userData: { role?: string; customerId?: string } | null | undefined;
  canCustomize: boolean;
  currentTime: string;
  onLogin: () => void;
  onSignOut: () => void;
  onCustomize: () => void;
  onPortal: () => void;
  onAdminPanel: () => void;
  onStart: (mode: 'racks' | 'basics') => void;
}

const INTRO_SEEN_KEY = 'wovn_landing_intro_seen';

/* ------------------------------------------------------------------ */
/* Preloader                                                          */
/* ------------------------------------------------------------------ */

function Preloader({ brand, onDone }: { brand: string; onDone: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const brandRef = useRef<HTMLSpanElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onDoneRef.current();
      return;
    }
    const counter = { value: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        sessionStorage.setItem(INTRO_SEEN_KEY, '1');
        onDoneRef.current();
      },
    });
    tl.fromTo(
      brandRef.current,
      { yPercent: 110 },
      { yPercent: 0, duration: 0.9, ease: 'power4.out' }
    )
      .to(
        counter,
        {
          value: 100,
          duration: 1.3,
          ease: 'power2.inOut',
          onUpdate: () => {
            if (counterRef.current) {
              counterRef.current.textContent = String(Math.round(counter.value)).padStart(3, '0');
            }
          },
        },
        0.1
      )
      .to(overlayRef.current, {
        yPercent: -100,
        duration: 0.9,
        ease: 'power4.inOut',
        delay: 0.15,
      });
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-zinc-950 p-6 text-[#faf9f5] md:p-12"
    >
      <div className="overflow-hidden">
        <span ref={brandRef} className="font-serif block text-4xl tracking-tight md:text-6xl">
          {brand}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          Custom merch, made properly
        </span>
        <span ref={counterRef} className="font-mono text-5xl font-light tabular-nums md:text-7xl">
          000
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Custom cursor                                                      */
/* ------------------------------------------------------------------ */

function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduce) return;
    setEnabled(true);

    const pos = { x: -100, y: -100 };
    const target = { x: -100, y: -100 };
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    const onOver = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const hoverable = el.closest('a, button, [data-cursor]');
      cursorRef.current?.classList.toggle('is-hovering', !!hoverable);
    };
    const loop = () => {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      if (cursorRef.current) {
        cursorRef.current.style.left = `${pos.x}px`;
        cursorRef.current.style.top = `${pos.y}px`;
      }
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!enabled) return null;
  return <div ref={cursorRef} className="landing-cursor" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Nav                                                                */
/* ------------------------------------------------------------------ */

function LandingNav({
  settings,
  user,
  userData,
  canCustomize,
  currentTime,
  scrolled,
  visible,
  onLogin,
  onSignOut,
  onCustomize,
  onPortal,
  onAdminPanel,
  onScrollTo,
}: Omit<ImmersiveLandingProps, 'onStart'> & {
  scrolled: boolean;
  visible: boolean;
  onScrollTo: (id: string) => void;
}) {
  const dark = !scrolled; // over hero = light text, after hero = ink on cream
  const role = userData?.role;
  const isClient = role === 'Client';
  const isStaff = role ? ['Admin', 'Leadership', 'Manager', 'Staff', 'Printer'].includes(role) : false;

  const ghostBtn = `font-inter cursor-pointer rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
    dark
      ? 'border-white/30 text-white hover:border-white hover:bg-white/10'
      : 'border-zinc-300 text-zinc-700 hover:border-zinc-950 hover:text-zinc-950'
  }`;
  const solidBtn = `font-inter cursor-pointer rounded-full px-5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
    dark
      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
      : 'bg-zinc-950 text-white hover:bg-zinc-800'
  }`;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      } ${scrolled ? 'border-b border-zinc-200/60 bg-[#faf9f5]/90 backdrop-blur-md' : 'bg-transparent'}`}
    >
      <div className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-4">
          <span
            className={`font-serif text-lg font-bold tracking-tight ${
              dark ? 'text-white' : 'text-zinc-950'
            }`}
          >
            {settings.logoText}
          </span>
          <span className={`hidden h-4 w-px md:block ${dark ? 'bg-white/25' : 'bg-zinc-300'}`} />
          <span
            className={`font-inter hidden items-center gap-2 text-[9px] font-bold uppercase tracking-[0.25em] md:flex ${
              dark ? 'text-zinc-300' : 'text-zinc-500'
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Portals open
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`font-mono mr-2 hidden text-[10px] font-semibold tracking-[0.2em] lg:block ${
              dark ? 'text-zinc-300' : 'text-zinc-500'
            }`}
          >
            {currentTime || '00:00:00'}
          </span>

          {canCustomize && (
            <button data-cursor onClick={onCustomize} className={ghostBtn}>
              Customize
            </button>
          )}

          {user ? (
            <>
              {isClient ? (
                <button data-cursor onClick={onPortal} className={solidBtn}>
                  View portal
                </button>
              ) : isStaff ? (
                <button data-cursor onClick={onAdminPanel} className={solidBtn}>
                  Admin panel
                </button>
              ) : (
                <span
                  className={`font-inter rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-600`}
                >
                  Pending
                </span>
              )}
              <button data-cursor onClick={onSignOut} className={ghostBtn}>
                Sign out
              </button>
            </>
          ) : (
            <button data-cursor onClick={onLogin} className={ghostBtn}>
              Login
            </button>
          )}

          <button data-cursor onClick={() => onScrollTo('#start-cta')} className={solidBtn}>
            Start
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Main composition                                                   */
/* ------------------------------------------------------------------ */

export function ImmersiveLanding(props: ImmersiveLandingProps) {
  const { settings, onStart } = props;
  const [introDone, setIntroDone] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(INTRO_SEEN_KEY) === '1'
  );
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lenisRef = useRef<Lenis | null>(null);
  const lastScrollY = useRef(0);

  // Smooth scroll engine + ScrollTrigger integration
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Nav state from scroll position (works with or without Lenis)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > window.innerHeight * 0.8);
      // Hide on scroll down, show on scroll up (always show near top)
      const goingDown = y > lastScrollY.current;
      setNavVisible(y < 120 || !goingDown);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Refresh trigger positions once intro finishes (hero content settles)
  useEffect(() => {
    if (introDone) ScrollTrigger.refresh();
  }, [introDone]);

  const scrollToId = useCallback((id: string) => {
    const el = document.querySelector(id);
    if (!el) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(el as HTMLElement, { duration: 1.4 });
    } else {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const role = props.userData?.role;

  return (
    <div className="landing-root font-sans w-full">
      {!introDone && (
        <Preloader brand={settings.logoText} onDone={() => setIntroDone(true)} />
      )}

      <CustomCursor />

      <LandingNav
        {...props}
        scrolled={scrolled}
        visible={navVisible}
        onScrollTo={scrollToId}
      />

      <main>
        <HeroSection settings={settings} introPlay={introDone} onScrollTo={scrollToId} />
        {settings.announcement && <AnnouncementMarquee text={settings.announcement} />}
        <ManifestoSection />
        <ShowcaseSection onStart={onStart} />
        <ProcessSection />
        <StartCTASection onStart={onStart} />
      </main>

      <LandingFooter
        settings={settings}
        currentTime={props.currentTime}
        isClient={role === 'Client'}
        hasUser={!!props.user}
        onPortal={props.onPortal}
        onLogin={props.onLogin}
        onScrollTo={scrollToId}
      />
    </div>
  );
}
