import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Link, Redirect, Router as WouterRouter, useLocation, useRoute } from 'wouter';
import {
  useGetCurrentUserRole, useListServices, useGetService, useCreateBooking,
  useListMyBookings, useCancelBooking, useCreateDepositCheckout,
  useListBookingAttachments, useCreateBookingAttachment, useRequestAttachmentUploadUrl,
  useGetStaffCalendar, useListAdminBookings, useGetAdminStats, useGetAdminActivity,
  useListRecentReviews, useSummarizeRecentReviews, useRequestServiceImageUploadUrl,
  useUpdateServiceImage, getListServicesQueryKey, getListMyBookingsQueryKey,
} from '@workspace/api-client-react';
import type { ListMyBookingsQueryResult, ListServicesQueryResult } from '@workspace/api-client-react';
import type { UploadRequest } from '@workspace/api-zod';
import {
  Anchor, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  ChevronDown, Clock3, FileText, ImagePlus, LogOut, Menu,
  Paperclip, Plus, ShieldAlert, Sparkles, Star, Waves, X,
} from 'lucide-react';

const queryClient = new QueryClient();
type Service = ListServicesQueryResult[number];
type BookingView = ListMyBookingsQueryResult[number];
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#23494a', colorForeground: '#263d3d', colorMutedForeground: '#697c78',
    colorDanger: '#a94f42', colorBackground: '#fbf8ef', colorInput: '#f7f2e5',
    colorInputForeground: '#263d3d', colorNeutral: '#d6cdbb', fontFamily: 'DM Sans',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8ef] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#23494a] font-serif', headerSubtitle: 'text-[#697c78]',
    socialButtonsBlockButtonText: 'text-[#263d3d]', formFieldLabel: 'text-[#263d3d]',
    footerActionLink: 'text-[#23494a]', footerActionText: 'text-[#697c78]',
    dividerText: 'text-[#697c78]', identityPreviewEditButton: 'text-[#23494a]',
    formFieldSuccessText: 'text-[#3e7867]', alertText: 'text-[#a94f42]',
    logoBox: 'rounded-xl', logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#d6cdbb] bg-[#f7f2e5]',
    formButtonPrimary: 'bg-[#23494a] hover:bg-[#173a3c] text-[#fbf8ef]',
    formFieldInput: 'border-[#d6cdbb] bg-[#f7f2e5] text-[#263d3d]',
    footerAction: 'border-t border-[#e4ddcf]', dividerLine: 'bg-[#d6cdbb]',
    alert: 'bg-[#f9eae4]', otpCodeFieldInput: 'border-[#d6cdbb]',
    formFieldRow: 'text-[#263d3d]', main: 'text-[#263d3d]',
  },
};

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(value).toLocaleDateString('en-US', options);
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const todayInput = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) client.clear();
    previous.current = id;
  }), [addListener, client]);
  return null;
}

function AppRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Come back to the water', subtitle: 'Sign in to your Harbor account' } }, signUp: { start: { title: 'Make room to reset', subtitle: 'Create your Harbor account' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <ClerkCacheSync />
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/services/:serviceId" component={ServicePage} />
      <Route path="/my-bookings" component={MyBookingsPage} />
      <Route path="/staff" component={StaffPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  </ClerkProvider>;
}

function SignInPage() {
  return <main className="auth-page"><div className="auth-copy"><Brand/><span className="eyebrow">THE TIDE IS TURNING</span><h1 className="font-editorial">A little space<br/>to come back<br/><i>to yourself.</i></h1><p>One thoughtful appointment can change the shape of a week.</p></div><div className="auth-card"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div></main>;
}
function SignUpPage() {
  return <main className="auth-page"><div className="auth-copy"><Brand/><span className="eyebrow">YOUR HARBOR, YOUR PACE</span><h1 className="font-editorial">Begin where<br/>the water<br/><i>is calm.</i></h1><p>Thoughtful care, by the edge of the bay.</p></div><div className="auth-card"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div></main>;
}

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Anchor size={19}/></span><span>HARBOR <small>BOOKINGS</small></span></Link>;
}

function Header() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const { data: role } = useGetCurrentUserRole({ query: { enabled: !!isSignedIn, queryKey: ['/api/me'] } });
  return <header className="site-header">
    <div className="header-inner"><Brand/><button className="mobile-menu" aria-label="Open navigation" onClick={() => setOpen(!open)} data-testid="button-menu">{open ? <X/> : <Menu/>}</button>
      <nav className={`main-nav ${open ? 'nav-open' : ''}`}>
        <Link href="/" data-testid="link-services">Services</Link>
        {isSignedIn && <Link href="/my-bookings" data-testid="link-my-bookings">My bookings</Link>}
        {role?.role === 'staff' || role?.role === 'admin' ? <Link href="/staff" data-testid="link-staff">Schedule</Link> : null}
        {role?.role === 'admin' && <Link href="/admin" data-testid="link-admin">Operations</Link>}
        {isSignedIn ? <button className="nav-action" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={15}/> Sign out <span className="user-initial">{user?.firstName?.[0] || 'H'}</span></button>
          : <Link href="/sign-in" className="nav-action" data-testid="link-sign-in">Sign in <ArrowUpRight size={15}/></Link>}
      </nav>
    </div>
  </header>;
}

function PageFrame({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return <div className="app-shell"><Header/>{children}{footer && <Footer/>}</div>;
}
function Footer() {
  return <footer className="site-footer"><Brand/><div>Made for the space between tides.<span>All people and bookings shown here are fictional test data.</span></div><span className="font-mono-ui">38° 56' N · 76° 28' W</span></footer>;
}
function LoadingBlock({ label = 'Gathering the day' }: { label?: string }) {
  return <div className="loading-panel" aria-label="Loading"><div className="skeleton-line wide"/><div className="skeleton-line"/><span>{label}</span></div>;
}
function ErrorPanel({ retry }: { retry: () => void }) {
  return <div className="empty-panel"><ShieldAlert/><h3>We lost the thread.</h3><p>That information could not be reached just now.</p><button className="button button-dark" onClick={retry} data-testid="button-retry">Try again <ArrowRight size={15}/></button></div>;
}
function EmptyPanel({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-panel"><Waves/><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function HomePage() {
  const services = useListServices();
  const [category, setCategory] = useState('all');
  const items = services.data || [];
  const categories = ['all', ...Array.from(new Set(items.map((s) => s.category)))];
  const shown = items.filter((s) => category === 'all' || s.category === category);
  return <PageFrame>
    <main>
      <section className="hero">
        <div className="hero-copy rise-in"><span className="eyebrow"><span className="live-dot"/> A HARBOR-SIDE STUDIO · ANNAPOLIS, MD</span>
          <h1 className="font-editorial">Find your<br/><i>steady water.</i></h1>
          <p>Room to breathe, think, and feel like yourself again. Guided by good people, grounded by the bay.</p>
          <a href="#offerings" className="button button-gold" data-testid="link-explore-services">Explore sessions <ArrowDownRight size={17}/></a>
          <div className="hero-note"><span className="note-rule"/> Small groups. Unhurried sessions. Always human.</div>
        </div>
        <div className="hero-art" role="img" aria-label="Illustration of the Chesapeake shoreline at sunrise">
          <div className="sun-disc"/><div className="horizon"/><div className="wave wave-one"/><div className="wave wave-two"/><div className="wave wave-three"/>
          <div className="hero-art-label"><span>EST. AT THE WATERLINE</span><b>Care that moves<br/>at your pace.</b></div>
          <span className="art-coordinate">CHESAPEAKE BAY / 06:18 AM</span>
        </div>
        <div className="hero-index">01 <span>—</span> 03</div>
      </section>
      <section className="intro-strip"><span>THE HARBOR APPROACH</span><p>Grounded practices. Open water. <i>A softer way forward.</i></p><span className="strip-mark">H / 01</span></section>
      <section id="offerings" className="offerings content-width">
        <div className="section-heading"><div><span className="eyebrow">MAKE SPACE FOR WHAT MATTERS</span><h2 className="font-editorial">Choose your <i>way in.</i></h2></div><p>Every session is built around you: your pace, your questions, your version of well.</p></div>
        <div className="filter-row">{categories.map((c) => <button key={c} onClick={() => setCategory(c)} className={`filter-chip ${category === c ? 'selected' : ''}`} data-testid={`filter-${c}`}>{c === 'all' ? 'Everything' : c}</button>)}</div>
        {services.isLoading ? <div className="service-grid">{[1,2,3].map((n) => <div className="skeleton-card" key={n}/>)}</div>
          : services.isError ? <ErrorPanel retry={() => services.refetch()}/>
          : shown.length === 0 ? <EmptyPanel title="A quiet moment." text="There are no sessions in this collection right now."/>
          : <div className="service-grid">{shown.map((service, i) => <ServiceCard service={service} key={service.id} index={i}/>)}</div>}
      </section>
      <section className="promise-band"><div className="promise-number">02 / OUR PROMISE</div><h2 className="font-editorial">A smaller pace.<br/><i>A wider view.</i></h2><div className="promise-copy"><p>Harbor is a neighborhood studio for people navigating change, seeking clarity, or simply ready to feel a little more at home in themselves.</p><div className="promise-signature"><span className="signature-line"/>Thoughtful care, close to the water.</div></div></section>
      <section className="closing-cta"><div><span className="eyebrow">WHEN YOU'RE READY</span><h2 className="font-editorial">The first step<br/>can be <i>small.</i></h2></div><Link href="#offerings" className="round-link" data-testid="link-browse-bottom"><ArrowDownRight size={24}/><span>Find a session</span></Link><span className="closing-coordinate">A PLACE TO PAUSE<br/>AND BEGIN AGAIN</span></section>
    </main>
  </PageFrame>;
}

function ServiceCard({ service, index }: { service: Service; index: number }) {
  return <Link href={`/services/${service.id}`} className={`service-card service-tone-${index % 3}`} data-testid={`card-service-${service.id}`}>
    <div className="service-visual">{service.imageUrl ? <img src={service.imageUrl.startsWith('/objects/') ? `/api/storage${service.imageUrl}` : service.imageUrl} alt="" /> : <ServiceArt kind={index % 3}/>}<span className="service-category">{service.category}</span><span className="service-arrow"><ArrowUpRight size={18}/></span></div>
    <div className="service-info"><div><h3 className="font-editorial">{service.name}</h3><p>{service.durationMinutes} min <span>·</span> {money(service.priceCents)}</p></div><span className="service-link">VIEW SESSION</span></div>
    <p className="service-description">{service.description}</p>
  </Link>;
}
function ServiceArt({ kind }: { kind: number }) {
  return <div className={`service-art art-${kind}`}><div className="art-circle"/><div className="art-hill"/><div className="art-orbit"/></div>;
}

function ServicePage() {
  const [, params] = useRoute('/services/:serviceId');
  const id = Number(params?.serviceId || 0);
  const service = useGetService(id, { query: { enabled: id > 0, queryKey: ['/api/services', id] } });
  return <PageFrame><main className="detail-page content-width">
    <Link href="/" className="back-link"><ArrowLeft size={15}/> All sessions</Link>
    {service.isLoading ? <LoadingBlock label="Opening this session"/> : service.isError || !service.data ? <ErrorPanel retry={() => service.refetch()}/> :
      <div className="detail-layout"><div className="detail-main"><div className="detail-image">{service.data.imageUrl ? <img src={service.data.imageUrl} alt=""/> : <ServiceArt kind={id % 3}/>}<span className="eyebrow">{service.data.category} / HARBOR STUDIO</span></div><span className="eyebrow">A SESSION FOR YOU</span><h1 className="font-editorial">{service.data.name}</h1><p className="detail-description">{service.data.description}</p><div className="detail-facts"><span><Clock3 size={16}/>{service.data.durationMinutes} minutes</span><span><Waves size={16}/>In-person, by the bay</span></div></div>
        <BookingForm service={service.data}/></div>}
  </main></PageFrame>;
}

function BookingForm({ service }: { service: Service }) {
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const [dateTime, setDateTime] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const create = useCreateBooking();
  const submit = () => {
    setNotice('');
    if (new Date(dateTime) <= new Date()) { setNotice('Choose a time in the future to continue.'); return; }
    if (!isSignedIn) { setLocation('/sign-in'); return; }
    create.mutate({ data: { serviceId: service.id, startsAt: new Date(dateTime).toISOString(), notes: notes.trim() || null } }, {
      onSuccess: () => { client.invalidateQueries({ queryKey: getListMyBookingsQueryKey() }); setNotice('Your request is in. Find it in My bookings.'); setNotes(''); },
      onError: () => setNotice('We could not save that request. Please try again.'),
    });
  };
  return <aside className="booking-panel"><span className="eyebrow">MAKE IT YOURS</span><h2 className="font-editorial">Book a session</h2><div className="booking-price">{money(service.priceCents)}<span> / {service.durationMinutes} min</span></div>
    <label className="field-label" htmlFor="booking-time">Choose a date & time</label><input id="booking-time" type="datetime-local" min={todayInput()} value={dateTime} onChange={(e) => setDateTime(e.target.value)} data-testid="input-booking-time"/>
    <label className="field-label" htmlFor="booking-notes">Anything we should know? <small>Optional</small></label><textarea id="booking-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="A little context helps us prepare." data-testid="input-booking-notes"/>
    <button onClick={submit} disabled={create.isPending} className="button button-dark full-button" data-testid="button-create-booking">{create.isPending ? 'Sending request…' : 'Request this time'} <ArrowRight size={16}/></button>
    {notice && <p className={`inline-notice ${notice.startsWith('Your') ? 'success' : ''}`} data-testid="status-booking">{notice}</p>}
    <p className="booking-footnote">No charge today. Deposit checkout is test-mode only and may be unavailable in this environment.</p>
  </aside>;
}

function Protected({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const role = useGetCurrentUserRole({ query: { enabled: !!isSignedIn, queryKey: ['/api/me'] } });
  const { signOut } = useClerk();
  if (!isLoaded || (isSignedIn && role.isLoading)) return <PageFrame><main className="content-width protected-loading"><LoadingBlock label="Checking your Harbor access"/></main></PageFrame>;
  if (!isSignedIn) return <Redirect to="/sign-in"/>;
  if (role.isError || !role.data || !roles.includes(role.data.role)) return <PageFrame><main className="content-width denied"><ShieldAlert size={25}/><span className="eyebrow">RESTRICTED AREA</span><h1 className="font-editorial">This dock isn't<br/>yours to enter.</h1><p>Your account doesn't have access to this space. If that seems wrong, check in with a Harbor administrator.</p><button className="button button-dark" onClick={() => signOut({ redirectUrl: basePath || '/' })}>Sign out <LogOut size={16}/></button></main></PageFrame>;
  return <>{children}</>;
}

function MyBookingsPage() {
  return <Protected roles={['customer']}><MyBookingsContent/></Protected>;
}
function MyBookingsContent() {
  const bookings = useListMyBookings();
  const [filter, setFilter] = useState('upcoming');
  const active = (bookings.data || []).filter((b) => filter === 'all' || (filter === 'upcoming' ? ['pending','confirmed'].includes(b.status) : ['completed','cancelled'].includes(b.status)));
  return <PageFrame><main className="content-width dashboard-page">
    <div className="page-kicker"><span className="eyebrow">YOUR HARBOR</span><span className="font-mono-ui">CUSTOMER / BOOKINGS</span></div>
    <div className="page-title-row"><div><h1 className="font-editorial">Your bookings<i>.</i></h1><p>Plans, notes, and a little room to change them.</p></div><Link href="/" className="button button-dark" data-testid="link-book-another">Find a session <Plus size={16}/></Link></div>
    <div className="filter-row booking-filter">{['upcoming','past','all'].map((f) => <button className={`filter-chip ${filter === f ? 'selected' : ''}`} onClick={() => setFilter(f)} key={f}>{f === 'upcoming' ? 'Upcoming' : f === 'past' ? 'Past & cancelled' : 'All bookings'}</button>)}</div>
    {bookings.isLoading ? <div className="booking-list">{[1,2].map((n) => <div className="skeleton-card" key={n}/>)}</div>
      : bookings.isError ? <ErrorPanel retry={() => bookings.refetch()}/>
      : active.length === 0 ? <EmptyPanel title="A little open water." text="There are no bookings in this view yet." action={<Link href="/" className="button button-dark">Explore sessions <ArrowRight size={16}/></Link>}/>
      : <div className="booking-list">{active.map((b) => <BookingRow key={b.id} booking={b}/>)}</div>}
  </main></PageFrame>;
}

function BookingRow({ booking }: { booking: BookingView }) {
  const client = useQueryClient();
  const cancel = useCancelBooking();
  const checkout = useCreateDepositCheckout();
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const attachments = useListBookingAttachments(booking.id, { query: { enabled: expanded, queryKey: ['/api/bookings', booking.id, 'attachments'] } });
  const upload = useRequestAttachmentUploadUrl();
  const saveAttachment = useCreateBookingAttachment();
  const canCancel = ['pending','confirmed'].includes(booking.status) && new Date(booking.startsAt) > new Date();
  const handleFile = async (file?: File) => {
    if (!file) return;
    const contentType = file.type as UploadRequest['contentType'];
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(contentType) || file.size > 10485760) { setMessage('Choose a JPG, PNG, WebP, or PDF under 10 MB.'); return; }
    setMessage('Preparing secure upload…');
    upload.mutate({ bookingId: booking.id, data: { name: file.name, size: file.size, contentType } }, {
      onSuccess: async (url) => {
        try {
          const response = await fetch(url.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!response.ok) throw new Error('Upload failed');
          saveAttachment.mutate({ bookingId: booking.id, data: { fileUrl: `/api/storage${url.objectPath}`, fileName: file.name } }, {
            onSuccess: () => { client.invalidateQueries({ queryKey: ['/api/bookings', booking.id, 'attachments'] }); setMessage('File added to your booking.'); },
            onError: () => setMessage('The file uploaded, but its booking record could not be saved.'),
          });
        } catch { setMessage('Upload did not finish. Please try again.'); }
      },
      onError: () => setMessage('Secure upload is unavailable right now.'),
    });
  };
  const pay = () => checkout.mutate({ bookingId: booking.id }, { onSuccess: (session) => { window.location.assign(session.checkoutUrl); }, onError: () => setMessage('Deposit checkout is Not set up yet. Please try again later.') });
  return <article className="booking-row" data-testid={`booking-${booking.id}`}>
    <div className="booking-date"><span>{dateLabel(booking.startsAt, { month: 'short' }).toUpperCase()}</span><b>{new Date(booking.startsAt).getDate()}</b><small>{timeLabel(booking.startsAt)}</small></div>
    <div className="booking-details"><div className="booking-heading"><div><span className="eyebrow">{booking.serviceDurationMinutes} MIN SESSION</span><h3 className="font-editorial">{booking.serviceName}</h3></div><StatusTag status={booking.status}/></div>
      {booking.notes && <p className="booking-note">“{booking.notes}”</p>}
      <div className="booking-actions">
        {canCancel && <button className="text-action danger" disabled={cancel.isPending} onClick={() => { if (window.confirm('Cancel this booking request?')) cancel.mutate({ bookingId: booking.id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMyBookingsQueryKey() }), onError: () => setMessage('We could not cancel this booking.') }); }} data-testid={`button-cancel-${booking.id}`}>{cancel.isPending ? 'Cancelling…' : 'Cancel booking'}</button>}
        {booking.status === 'pending' && <button className="text-action" onClick={pay} disabled={checkout.isPending} data-testid={`button-deposit-${booking.id}`}>{checkout.isPending ? 'Opening checkout…' : 'Pay deposit'} <ArrowUpRight size={14}/></button>}
        <button className="text-action" onClick={() => setExpanded(!expanded)} data-testid={`button-files-${booking.id}`}>{expanded ? 'Hide files' : 'Files & notes'} <ChevronDown size={14}/></button>
      </div>
      {expanded && <div className="attachment-panel"><div className="attachment-heading"><div><b>Booking files</b><span>Shared privately with your Harbor team.</span></div><label className="upload-button"><Paperclip size={15}/>{upload.isPending || saveAttachment.isPending ? 'Uploading…' : 'Add file'}<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => handleFile(e.target.files?.[0])} disabled={upload.isPending || saveAttachment.isPending} data-testid={`input-attachment-${booking.id}`}/></label></div>
        {attachments.isLoading ? <div className="skeleton-line"/> : attachments.isError ? <p className="inline-notice">Attachments couldn't be loaded.</p> : attachments.data?.length ? attachments.data.map((f) => <a key={f.id} className="attachment-item" href={f.fileUrl} target="_blank" rel="noreferrer"><FileText size={16}/><span>{f.fileName}</span><ArrowUpRight size={13}/></a>) : <p className="subtle">No files attached yet.</p>}
        {message && <p className="inline-notice" data-testid={`status-attachment-${booking.id}`}>{message}</p>}
      </div>}
    </div>
    <div className="booking-total">{money(booking.servicePriceCents)}<span>session fee</span></div>
  </article>;
}
function StatusTag({ status }: { status: string }) {
  return <span className={`status-tag status-${status}`} data-testid={`status-${status}`}>{status}</span>;
}

function StaffPage() {
  return <Protected roles={['staff','admin']}><StaffContent/></Protected>;
}
function StaffContent() {
  const calendar = useGetStaffCalendar();
  const [day, setDay] = useState(() => new Date());
  const chosen = day.toDateString();
  const events = (calendar.data || []).filter((b) => new Date(b.startsAt).toDateString() === chosen).sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const changeDay = (amount: number) => setDay((d) => { const next = new Date(d); next.setDate(d.getDate() + amount); return next; });
  return <PageFrame><main className="content-width dashboard-page">
    <div className="page-kicker"><span className="eyebrow">HARBOR TEAM</span><span className="font-mono-ui">STAFF / DAILY VIEW</span></div>
    <div className="page-title-row"><div><h1 className="font-editorial">The schedule<i>.</i></h1><p>A clear view of the day, one appointment at a time.</p></div><div className="date-controls"><button onClick={() => changeDay(-1)} aria-label="Previous day" data-testid="button-previous-day"><ArrowLeft size={17}/></button><button onClick={() => setDay(new Date())} data-testid="button-today">Today</button><button onClick={() => changeDay(1)} aria-label="Next day" data-testid="button-next-day"><ArrowRight size={17}/></button></div></div>
    <div className="schedule-summary"><div><span className="eyebrow">SELECTED DAY</span><b>{dateLabel(day.toISOString(), { weekday: 'long', month: 'long', day: 'numeric' })}</b></div><div><span className="eyebrow">ON THE BOOKS</span><b>{calendar.isLoading ? '—' : events.length} <small>appointments</small></b></div><div className="calendar-icon"><CalendarDays size={25}/></div></div>
    {calendar.isLoading ? <LoadingBlock label="Checking the day's schedule"/> : calendar.isError ? <ErrorPanel retry={() => calendar.refetch()}/> : events.length === 0 ? <EmptyPanel title="No appointments on this tide." text="The schedule is clear for this day. Take a breath, and check another date."/> : <div className="schedule-list">{events.map((b) => <article className="schedule-item" key={b.id} data-testid={`schedule-booking-${b.id}`}><div className="schedule-time">{timeLabel(b.startsAt)}<span>{b.serviceDurationMinutes} MIN</span></div><div className="schedule-marker"/><div className="schedule-content"><span className="eyebrow">{b.serviceName}</span><h3>{b.customerName || 'Harbor guest'}</h3><p>{b.customerEmail || 'Customer contact unavailable'}</p>{b.notes && <div className="staff-note">Guest note · {b.notes}</div>}</div><StatusTag status={b.status}/></article>)}</div>}
  </main></PageFrame>;
}

function AdminPage() {
  return <Protected roles={['admin']}><AdminContent/></Protected>;
}
function AdminContent() {
  const stats = useGetAdminStats();
  const bookings = useListAdminBookings();
  const activity = useGetAdminActivity();
  const reviews = useListRecentReviews();
  const summarize = useSummarizeRecentReviews();
  const services = useListServices();
  const [summary, setSummary] = useState<{summary: string; reviewCount: number} | null>(null);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [imageService, setImageService] = useState('');
  const imageUrl = useRequestServiceImageUploadUrl();
  const saveImage = useUpdateServiceImage();
  const client = useQueryClient();
  const all = bookings.data || [];
  const filtered = all.filter((b) => bookingFilter === 'all' || b.status === bookingFilter);
  const handleImage = async (file?: File) => {
    if (!file || !imageService) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10485760) { alert('Choose a JPG, PNG, or WebP image under 10 MB.'); return; }
    const contentType = file.type as UploadRequest['contentType'];
    imageUrl.mutate({ serviceId: Number(imageService), data: { name: file.name, size: file.size, contentType } }, {
      onSuccess: async (url) => {
        try {
          const response = await fetch(url.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!response.ok) throw new Error();
          saveImage.mutate({ serviceId: Number(imageService), data: { imageUrl: `/api/storage/public-objects${url.objectPath}` } }, {
            onSuccess: () => { client.invalidateQueries({ queryKey: getListServicesQueryKey() }); alert('Service image updated.'); },
            onError: () => alert('The image uploaded, but the service record could not be updated.'),
          });
        } catch { alert('Image upload failed. Please try again.'); }
      },
      onError: () => alert('Image upload is unavailable right now.'),
    });
  };
  return <PageFrame><main className="content-width dashboard-page admin-page">
    <div className="page-kicker"><span className="eyebrow">HARBOR OPERATIONS</span><span className="font-mono-ui">ADMIN / OVERVIEW</span></div>
    <div className="page-title-row"><div><h1 className="font-editorial">A view from <i>the dock.</i></h1><p>Operations, service health, and the people who make Harbor.</p></div><span className="demo-pill"><span className="live-dot"/> SYNTHETIC TEST DATA</span></div>
    {stats.isLoading ? <div className="stats-grid">{[1,2,3,4].map((n) => <div className="skeleton-card" key={n}/>)}</div> : stats.isError ? <ErrorPanel retry={() => stats.refetch()}/> : stats.data ?
      <div className="stats-grid"><Stat label="ALL BOOKINGS" value={stats.data.total} detail="Across all statuses"/><Stat label="NEEDS A RESPONSE" value={stats.data.pending} detail="Pending requests" accent/><Stat label="COMPLETED" value={stats.data.completed} detail={`${stats.data.confirmed} confirmed`}/><Stat label="REVIEW SCORE" value={stats.data.reviewCount ? stats.data.averageRating.toFixed(1) : '—'} detail={`${stats.data.reviewCount} recent reviews`} star/></div> : <LoadingBlock/>}
    <section className="admin-section"><div className="admin-section-head"><div><span className="eyebrow">THE CUSTOMER JOURNEY</span><h2 className="font-editorial">All bookings</h2></div><select value={bookingFilter} onChange={(e) => setBookingFilter(e.target.value)} aria-label="Filter bookings" data-testid="select-booking-status"><option value="all">All statuses</option>{['pending','confirmed','completed','cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      {bookings.isLoading ? <LoadingBlock/> : bookings.isError ? <ErrorPanel retry={() => bookings.refetch()}/> : filtered.length === 0 ? <EmptyPanel title="Nothing in this view." text="Bookings will appear here as guests make requests."/> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Guest</th><th>Service</th><th>Appointment</th><th>Status</th><th>Value</th></tr></thead><tbody>{filtered.map((b) => <tr key={b.id} data-testid={`admin-booking-${b.id}`}><td><b>{b.customerName || 'Harbor guest'}</b><span>{b.customerEmail || 'Synthetic account'}</span></td><td>{b.serviceName}</td><td>{dateLabel(b.startsAt)}<span>{timeLabel(b.startsAt)}</span></td><td><StatusTag status={b.status}/></td><td>{money(b.servicePriceCents)}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="admin-lower"><section className="admin-section review-section"><div className="admin-section-head"><div><span className="eyebrow">WORDS FROM THE WATERLINE</span><h2 className="font-editorial">Recent reviews</h2></div><button className="button button-outline" onClick={() => summarize.mutate(undefined, { onSuccess: setSummary, onError: () => setSummary({ summary: 'Not set up yet: add OPENAI_API_KEY to enable review summaries.', reviewCount: 0 }) })} disabled={summarize.isPending} data-testid="button-ai-summary"><Sparkles size={15}/>{summarize.isPending ? 'Listening…' : 'Summarize'}</button></div>
      {summary && <div className="ai-summary" data-testid="text-ai-summary"><Sparkles size={17}/><div><b>AI reflection <small>{summary.reviewCount ? `${summary.reviewCount} reviews` : 'Not configured'}</small></b><p>{summary.summary}</p></div></div>}
      {reviews.isLoading ? <LoadingBlock/> : reviews.isError ? <ErrorPanel retry={() => reviews.refetch()}/> : reviews.data?.length ? reviews.data.map((r) => <article className="review-card" key={r.id} data-testid={`review-${r.id}`}><div className="review-stars">{Array.from({length: 5}, (_, i) => <Star key={i} size={13} fill={i < r.rating ? 'currentColor' : 'none'}/>)}</div><p>“{r.comment}”</p><span>{r.serviceName} <i>·</i> {dateLabel(r.createdAt)}</span></article>) : <EmptyPanel title="A blank page, for now." text="Reviews will show up here once guests share their thoughts."/>}
    </section>
    <section className="admin-section side-section"><div className="admin-section-head"><div><span className="eyebrow">THE STUDIO</span><h2 className="font-editorial">Service imagery</h2></div><ImagePlus size={19}/></div><p className="subtle">Keep each service page feeling like its own little place.</p>
      {services.isLoading ? <LoadingBlock/> : services.isError ? <ErrorPanel retry={() => services.refetch()}/> : <><label className="field-label" htmlFor="image-service">Choose a service</label><select id="image-service" value={imageService} onChange={(e) => setImageService(e.target.value)} data-testid="select-image-service"><option value="">Select service…</option>{services.data?.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select><label className={`image-drop ${!imageService ? 'disabled' : ''}`}><ImagePlus size={20}/><b>{imageUrl.isPending || saveImage.isPending ? 'Uploading image…' : 'Choose an image'}</b><span>JPG, PNG or WebP · up to 10 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={!imageService || imageUrl.isPending || saveImage.isPending} onChange={(e) => handleImage(e.target.files?.[0])} data-testid="input-service-image"/></label></>}
    </section></div>
    <section className="admin-section activity-section"><div className="admin-section-head"><div><span className="eyebrow">A LIGHT PAPER TRAIL</span><h2 className="font-editorial">Recent activity</h2></div><ArrowUpRight size={18}/></div>{activity.isLoading ? <LoadingBlock/> : activity.isError ? <ErrorPanel retry={() => activity.refetch()}/> : activity.data?.length ? <div className="activity-list">{activity.data.map((event) => <div className="activity-row" key={event.id} data-testid={`activity-${event.id}`}><span className="activity-mark"/><div><b>{event.action.replace(/[_-]/g, ' ')}</b><span>{Object.entries(event.details || {}).map(([k,v]) => `${k}: ${String(v)}`).join(' · ') || 'Harbor activity recorded'}</span></div><time>{dateLabel(event.createdAt, { month: 'short', day: 'numeric' })} · {timeLabel(event.createdAt)}</time></div>)}</div> : <EmptyPanel title="Still water." text="Activity will be recorded here as the studio gets moving."/>}</section>
  </main></PageFrame>;
}
function Stat({ label, value, detail, accent = false, star = false }: { label: string; value: string | number; detail: string; accent?: boolean; star?: boolean }) {
  return <article className={`stat-card ${accent ? 'stat-accent' : ''}`}><span className="eyebrow">{label}</span><b>{star && <Star size={20} fill="currentColor"/>}{value}</b><span>{detail}</span></article>;
}

function NotFound() {
  return <PageFrame><main className="content-width not-found"><span className="eyebrow">OUT OF RANGE / 404</span><h1 className="font-editorial">Lost your<br/><i>bearings?</i></h1><p>This page doesn't seem to be on today's chart.</p><Link href="/" className="button button-dark">Return to Harbor <ArrowRight size={16}/></Link></main></PageFrame>;
}

function App() {
  if (!clerkPubKey) return <div className="config-error"><Brand/><h1 className="font-editorial">Harbor is almost ready.</h1><p>Clerk authentication needs a publishable key for this environment.</p></div>;
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><AppRouter/></WouterRouter></QueryClientProvider>;
}

export default App;
