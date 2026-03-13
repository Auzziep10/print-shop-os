export const tokens = {
    colors: {
        bg: 'bg-brand-bg',
        text: {
            primary: 'text-brand-primary',
            secondary: 'text-brand-secondary',
        },
        border: 'border-brand-border',
    },
    typography: {
        h1: 'font-serif text-5xl tracking-tight text-brand-primary leading-tight',
        h2: 'font-serif text-3xl tracking-tight text-brand-primary leading-snug',
        h3: 'font-serif text-2xl tracking-tight text-brand-primary',
        body: 'font-sans text-base text-brand-primary',
        bodyMuted: 'font-sans text-sm text-brand-secondary',
        label: 'font-sans text-xs font-semibold tracking-wider uppercase text-brand-secondary',
    },
    layout: {
        page: 'min-h-screen bg-brand-bg font-sans selection:bg-brand-primary selection:text-white',
        container: 'max-w-7xl mx-auto px-6 py-12 w-full',
        pageHeader: 'pb-10 pt-4 flex justify-between items-end',
        editorialSplit: 'grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24',
        editorialLeft: 'lg:col-span-7',
        editorialRight: 'lg:col-span-5 flex flex-col',
    },
    components: {
        card: 'bg-white rounded-card border border-brand-border p-card relative overflow-hidden',
        pillButton: {
            base: 'inline-flex items-center justify-center px-6 py-2.5 rounded-pill text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 whitespace-nowrap',
            filled: 'bg-brand-primary text-white hover:bg-black border border-transparent',
            outline: 'bg-transparent text-brand-primary border border-brand-border hover:bg-brand-muted',
        },
        input: 'w-full rounded-md border border-brand-border px-4 py-3 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-border focus:border-brand-primary transition-all text-brand-primary placeholder:text-brand-secondary',
    }
};
