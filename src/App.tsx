import { useState, useEffect, useMemo } from 'react';
import { 
  Coffee, 
  Wifi, 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  ChevronRight, 
  Instagram, 
  Facebook, 
  BookOpen,
  Laptop,
  Moon,
  Sun,
  Flame,
  Palette,
  Zap,
  User,
  LogOut,
  Heart,
  HeartOff,
  Ticket,
  ShieldCheck,
  CreditCard,
  BarChart3,
  HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { auth, db, googleProvider, signInWithPopup, signOut } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Types
type TableStatus = 'available' | 'occupied' | 'reserved';
interface Table {
  id: number;
  status: TableStatus;
  capacity: number;
  x: number;
  y: number;
}

type WorkMode = 'all' | 'deep' | 'creative' | 'group';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const MENU_CATEGORIES = [
  { id: 'coffee', name: 'Artisan Coffee', icon: Coffee },
  { id: 'pastries', name: 'Fresh Pastries', icon: BookOpen },
  { id: 'worker', name: 'Remote Worker Specials', icon: Laptop },
];

const MENU_ITEMS = [
  // Coffee
  { name: 'Charcoal Latte', category: 'coffee', price: '$5.50', desc: 'Activated charcoal, espresso, and creamy oat milk.', mode: 'deep', caffeine: 'High', notes: 'Earthy & Creamy' },
  { name: 'Brick House Blend', category: 'coffee', price: '$3.75', desc: 'Our signature dark roast with notes of chocolate and earth.', mode: 'deep', caffeine: 'Medium', notes: 'Dark Chocolate' },
  { name: 'Cold Brew Nitro', category: 'coffee', price: '$6.00', desc: 'Velvety smooth, poured cold from the tap.', mode: 'deep', caffeine: 'Very High', notes: 'Bold & Smokey' },
  { name: 'Butterfly Pea Tea Latte', category: 'coffee', price: '$5.75', desc: 'Vibrant blue tea with honey and lavender froth.', mode: 'creative', caffeine: 'None', notes: 'Floral & Sweet' },
  
  // Pastries
  { name: 'Terracotta Croissant', category: 'pastries', price: '$4.50', desc: 'Twice-baked with almond cream and orange zest.', mode: 'creative', caffeine: 'N/A', notes: 'Citrus & Flaky' },
  { name: 'Brick-Pressed Panini', category: 'pastries', price: '$12.00', desc: 'Sourdough, pesto, mozzarella, and sun-dried tomatoes.', mode: 'group', caffeine: 'N/A', notes: 'Savory' },
  { name: 'Grazing Board', category: 'pastries', price: '$18.00', desc: 'Local cheeses, nuts, dried fruits, and artisan crackers.', mode: 'group', caffeine: 'N/A', notes: 'Sharable' },
  
  // Worker Specials
  { name: 'The Deep Focus', category: 'worker', price: '$15.00', desc: 'Bottomless coffee + High-speed Wi-Fi token + quiet zone seat.', mode: 'deep', caffeine: 'Infinite', notes: 'Productive' },
  { name: 'Creative Spark', category: 'worker', price: '$14.00', desc: 'Matcha Latte + Avocado Toast + Sketchbook rental.', mode: 'creative', caffeine: 'Medium', notes: 'Inspiring' },
  { name: 'Collab Platter', category: 'worker', price: '$35.00', desc: '4 Coffees + Large Pastry Box + Table priority.', mode: 'group', caffeine: 'Mixed', notes: 'Team Building' },
];

const COMMUNITY_EVENTS = [
  { title: 'Code & Coffee Tuesday', date: 'May 5, 8:00 AM', tag: 'Tech' },
  { title: 'Acoustic Brick Sessions', date: 'May 7, 6:00 PM', tag: 'Music' },
  { title: 'Local Bean Roasters Meetup', date: 'May 10, 10:00 AM', tag: 'Workshop' },
  { title: 'Book Club: Modern Urbanism', date: 'May 12, 7:00 PM', tag: 'Reading' },
];

const INITIAL_TABLES: Table[] = [
  { id: 1, status: 'available', capacity: 2, x: 20, y: 20 },
  { id: 2, status: 'occupied', capacity: 1, x: 50, y: 20 },
  { id: 3, status: 'available', capacity: 2, x: 80, y: 20 },
  { id: 4, status: 'reserved', capacity: 4, x: 20, y: 50 },
  { id: 5, status: 'available', capacity: 4, x: 50, y: 50 },
  { id: 6, status: 'occupied', capacity: 2, x: 80, y: 50 },
  { id: 7, status: 'available', capacity: 6, x: 50, y: 80 },
];

export default function App() {
  const [activeCategory, setActiveCategory] = useState('coffee');
  const [activeWorkMode, setActiveWorkMode] = useState<WorkMode>('all');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [tables, setTables] = useState<Table[]>(INITIAL_TABLES);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<{
    loyaltyPunches: number;
    favoriteItems: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [voucherCode, setVoucherCode] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserProfile({
              loyaltyPunches: data.loyaltyPunches || 0,
              favoriteItems: data.favoriteItems || [],
            });
          } else {
            const initialProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              loyaltyPunches: 0,
              favoriteItems: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userDocRef, initialProfile);
            setUserProfile({
              loyaltyPunches: 0,
              favoriteItems: [],
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const punchLoyaltyCard = async () => {
    if (!user || !userProfile) return;
    
    const newPunches = userProfile.loyaltyPunches + 1;
    const userDocRef = doc(db, 'users', user.uid);
    
    try {
      if (newPunches >= 10) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D2691E', '#2F3131', '#F5F5DC']
        });
        setVoucherCode(`FREE-BEV-${Math.random().toString(36).substring(7).toUpperCase()}`);
        await setDoc(userDocRef, { 
          loyaltyPunches: 0,
          updatedAt: serverTimestamp() 
        }, { merge: true });
        setUserProfile(prev => prev ? { ...prev, loyaltyPunches: 0 } : null);
      } else {
        await setDoc(userDocRef, { 
          loyaltyPunches: newPunches,
          updatedAt: serverTimestamp() 
        }, { merge: true });
        setUserProfile(prev => prev ? { ...prev, loyaltyPunches: newPunches } : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const toggleFavorite = async (itemName: string) => {
    if (!user || !userProfile) return;

    const isFavorite = userProfile.favoriteItems.includes(itemName);
    const newFavorites = isFavorite 
      ? userProfile.favoriteItems.filter(i => i !== itemName)
      : [...userProfile.favoriteItems, itemName];

    const userDocRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userDocRef, { 
        favoriteItems: newFavorites,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      setUserProfile(prev => prev ? { ...prev, favoriteItems: newFavorites } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setIsAuthOpen(false);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAuthOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const filteredMenu = useMemo(() => {
    return MENU_ITEMS.filter(item => {
      const matchCat = item.category === activeCategory;
      const matchMode = activeWorkMode === 'all' || item.mode === activeWorkMode;
      return matchCat && matchMode;
    });
  }, [activeCategory, activeWorkMode]);

  const toggleTableStatus = (id: number) => {
    setTables(prev => prev.map(t => {
      if (t.id === id) {
        const nextStatus: TableStatus = t.status === 'available' ? 'reserved' : t.status === 'reserved' ? 'occupied' : 'available';
        return { ...t, status: nextStatus };
      }
      return t;
    }));
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-cafe-charcoal/90 backdrop-blur-md text-cafe-cream py-4 px-6 md:px-12 flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-2 group cursor-pointer">
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 5 }}
            className="w-10 h-10 bg-cafe-brick rounded-lg flex items-center justify-center font-display text-xl font-bold border border-white/10"
          >
            B
          </motion.div>
          <span className="font-display text-xl tracking-tighter hidden sm:inline group-hover:text-cafe-brick transition-colors">BRICK & BEAN</span>
        </div>
        
        <div className="flex items-center space-x-4 md:space-x-8">
          <div className="hidden md:flex space-x-8 text-sm font-display uppercase tracking-widest">
            <a href="#menu" className="hover:text-cafe-brick transition-colors">Menu</a>
            <a href="#community" className="hover:text-cafe-brick transition-colors">Community</a>
            <a href="#reserve" className="hover:text-cafe-brick transition-colors">Reserve</a>
          </div>
          
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-cafe-sand"
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <div className="relative">
            <button 
              className="flex items-center p-1 rounded-full bg-cafe-brick text-white hover:scale-110 active:scale-95 transition-all shadow-lg border border-white/10 group overflow-hidden"
              onClick={() => setIsAuthOpen(!isAuthOpen)}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="p-1.5 md:p-2">
                  <User size={20} />
                </div>
              )}
            </button>

            <AnimatePresence>
              {isAuthOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-3 w-56 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden z-[100] p-2"
                >
                  {user ? (
                    <>
                      <div className="px-4 py-3 border-b border-[var(--border-color)] mb-1">
                        <p className="text-xs font-bold truncate">{user.displayName || 'Cafe Client'}</p>
                        <p className="text-[10px] opacity-60 truncate">{user.email}</p>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3 text-[10px] font-display uppercase tracking-[0.2em] hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors flex items-center space-x-2"
                      >
                        <LogOut size={14} />
                        <span>Sign Out</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={handleLogin}
                        className="w-full text-left px-4 py-3 text-[10px] font-display uppercase tracking-[0.2em] hover:bg-cafe-brick/10 rounded-xl transition-colors text-current flex items-center space-x-2"
                      >
                        <span>Sign in with Google</span>
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <motion.div 
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 15, repeat: Infinity, repeatType: 'reverse' }}
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=2400")' }}
        />
        <div className="absolute inset-0 bg-cafe-charcoal/40" />
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="relative glass-overlay p-8 md:p-16 max-w-3xl text-center mx-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <h1 className="text-4xl md:text-7xl mb-4 text-white drop-shadow-2xl">
              Brick & Bean Cafe
            </h1>
            <p className="text-lg md:text-2xl text-cafe-cream/90 font-sans italic mb-8">
              "Your neighborhood's second living room."
            </p>
          </motion.div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="#menu" 
              className="bg-cafe-brick text-white px-8 py-4 rounded-full font-display uppercase tracking-widest hover:bg-cafe-brick/80 transition-all transform hover:-translate-y-1 shadow-xl"
            >
              Explore Menu
            </a>
            <a 
              href="#reserve" 
              className="bg-white/10 text-white border border-white/30 backdrop-blur-md px-8 py-4 rounded-full font-display uppercase tracking-widest hover:bg-white/20 transition-all transform hover:-translate-y-1"
            >
              Book a Desk
            </a>
          </div>
        </motion.div>
      </section>

      {/* Fuel Meter (Work Mode Filter) */}
      <section className="bg-cafe-charcoal py-8 border-b border-cafe-brick/20 relative z-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <Zap className="text-cafe-brick fill-cafe-brick animate-pulse" />
            <span className="font-display font-medium text-cafe-cream uppercase tracking-wide">Work Mode Fuel Meter:</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {(['all', 'deep', 'creative', 'group'] as WorkMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveWorkMode(mode)}
                className={`px-4 py-2 rounded-full text-xs font-display uppercase tracking-widest transition-all border ${
                  activeWorkMode === mode 
                  ? 'bg-cafe-brick border-cafe-brick text-white shadow-[0_0_15px_rgba(210,105,30,0.4)]' 
                  : 'bg-transparent border-white/20 text-white/60 hover:border-white/40'
                }`}
              >
                {mode === 'all' && 'Normal Brew'}
                {mode === 'deep' && <span className="flex items-center gap-2"><Flame size={12} /> Deep Work</span>}
                {mode === 'creative' && <span className="flex items-center gap-2"><Palette size={12} /> Creative</span>}
                {mode === 'group' && <span className="flex items-center gap-2"><Users size={12} /> Group</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Member Dashboard */}
      {user && (
        <section className="py-12 bg-[var(--card-bg)] border-b border-[var(--border-color)]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Loyalty Card */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                className="bg-cafe-charcoal p-8 rounded-[32px] text-white shadow-2xl relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Ticket size={120} className="rotate-12" />
                </div>
                
                <h3 className="font-display text-xl mb-2 flex items-center gap-2">
                  <CreditCard className="text-cafe-brick" />
                  My Brew Card
                </h3>
                <p className="text-xs opacity-60 mb-8 font-sans">Buy 9 drinks, get the 10th on us.</p>
                
                <div className="grid grid-cols-5 gap-4 mb-8">
                  {[...Array(10)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                        i < (userProfile?.loyaltyPunches || 0) 
                        ? 'bg-cafe-brick border-cafe-brick scale-110 shadow-[0_0_15px_#D2691E]' 
                        : 'bg-white/5 border-white/20'
                      }`}
                    >
                      <Coffee size={16} className={i < (userProfile?.loyaltyPunches || 0) ? 'text-white' : 'text-white/20'} />
                    </div>
                  ))}
                </div>

                {voucherCode ? (
                  <div className="bg-green-500/20 border border-green-500/50 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-widest text-green-500 mb-1">Your Free Drink Code</span>
                    <span className="text-xl font-mono font-bold tracking-tighter text-white">{voucherCode}</span>
                    <p className="text-[10px] opacity-60 mt-2">Show this to the barista!</p>
                  </div>
                ) : (
                  <button 
                    onClick={punchLoyaltyCard}
                    disabled={!userProfile}
                    className="w-full py-4 bg-cafe-brick rounded-2xl font-display uppercase tracking-widest hover:bg-cafe-brick/80 transition-all active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <span>Simulate Purchase</span>
                    <Zap size={14} className="fill-current" />
                  </button>
                )}
              </motion.div>

              {/* WFC Pass Dashboard */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                className="bg-white/5 border border-[var(--border-color)] p-8 rounded-[32px] relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="font-display text-xl mb-1 flex items-center gap-2">
                      <ShieldCheck className="text-cafe-brick" />
                      WFC Membership
                    </h3>
                    <div className="flex items-center space-x-2">
                       <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-[9px] font-bold rounded uppercase">Active</span>
                       <span className="text-[10px] opacity-40">Pro Tier</span>
                    </div>
                  </div>
                  <BarChart3 className="opacity-20" size={32} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border-color)]">
                    <div className="flex items-center gap-2 opacity-50 mb-1">
                      <Clock size={12} />
                      <span className="text-[10px] uppercase font-display">Time Today</span>
                    </div>
                    <p className="text-2xl font-display tracking-tighter">4h 22m</p>
                  </div>
                  <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border-color)]">
                    <div className="flex items-center gap-2 opacity-50 mb-1">
                      <HardDrive size={12} />
                      <span className="text-[10px] uppercase font-display">Data Usage</span>
                    </div>
                    <p className="text-2xl font-display tracking-tighter text-cafe-brick">1.2 GB</p>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest font-display opacity-60">
                    <span>WiFi Reliability</span>
                    <span>99.9%</span>
                  </div>
                  <div className="w-full bg-cafe-charcoal/10 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cafe-brick h-full w-[99.9%]" />
                  </div>
                </div>
                
                <p className="mt-6 text-[10px] opacity-40 italic text-center">
                  "Members get priority booking & unlimited refills."
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="transition-colors duration-500">
        {/* Interactive Menu Section */}
        <section id="menu" className="py-24 px-6 max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl mb-4 italic">The Daily Grind</h2>
            <div className="w-24 h-1 bg-cafe-brick mx-auto" />
          </motion.div>

          {/* My Usuals (Favorites) */}
          {user && userProfile && userProfile.favoriteItems.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-16 p-6 bg-cafe-brick/5 rounded-3xl border border-cafe-brick/10"
            >
              <div className="flex items-center space-x-2 mb-6">
                <Heart className="w-4 h-4 text-cafe-brick fill-cafe-brick" />
                <h3 className="font-display text-sm uppercase tracking-widest">My Usuals</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {MENU_ITEMS.filter(item => userProfile.favoriteItems.includes(item.name)).map(item => (
                  <div key={`usual-${item.name}`} className="flex items-center justify-between p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
                    <span className="text-xs font-medium">{item.name}</span>
                    <button 
                      onClick={() => toggleFavorite(item.name)}
                      className="text-cafe-brick hover:scale-110 transition-transform"
                    >
                      <Heart className="w-4 h-4 fill-cafe-brick" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Category Tabs */}
          <div className="flex justify-center flex-wrap gap-4 mb-16">
            {MENU_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-display text-sm uppercase tracking-widest transition-all ${
                  activeCategory === cat.id 
                  ? 'bg-cafe-brick text-white shadow-xl scale-105' 
                  : 'bg-cafe-charcoal/5 text-current hover:bg-cafe-charcoal/10 border border-transparent'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Menu Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredMenu.map((item, idx) => (
                <motion.div
                  layout
                  key={item.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="bg-[var(--card-bg)] p-8 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.05)] hover:shadow-2xl transition-all group flex flex-col justify-between border border-[var(--border-color)] relative overflow-hidden"
                >
                  {/* Mode Badge */}
                  <div className={`absolute top-0 right-0 px-4 py-1 text-[10px] uppercase font-display text-white ${
                    item.mode === 'deep' ? 'bg-cafe-charcoal' : item.mode === 'creative' ? 'bg-purple-600' : 'bg-cafe-brick'
                  }`}>
                    {item.mode} focus
                  </div>

                  <button 
                    onClick={() => toggleFavorite(item.name)}
                    className="absolute top-2 left-2 p-2 rounded-full bg-white/10 backdrop-blur-md transition-all hover:scale-110 active:scale-95 group/heart"
                  >
                    {userProfile?.favoriteItems.includes(item.name) ? (
                      <Heart className="w-4 h-4 text-cafe-brick fill-cafe-brick" />
                    ) : (
                      <Heart className="w-4 h-4 text-white hover:text-cafe-brick transition-colors" />
                    )}
                  </button>

                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl leading-tight group-hover:text-cafe-brick transition-colors">{item.name}</h3>
                      <span className="text-cafe-brick font-display font-medium text-lg">{item.price}</span>
                    </div>
                    <p className="text-current opacity-60 leading-relaxed italic mb-6">{item.desc}</p>
                    
                    {/* Tooltip-like Micro-info */}
                    <div className="flex gap-4 border-t border-[var(--border-color)] pt-4 mt-auto">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider opacity-40">Caffeine</span>
                        <span className="text-xs font-display font-bold uppercase">{item.caffeine}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider opacity-40">Profile</span>
                        <span className="text-xs font-display font-bold uppercase">{item.notes}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-end">
                    <button className="bg-cafe-brick/10 p-2 rounded-full text-cafe-brick hover:bg-cafe-brick hover:text-white transition-all transform hover:rotate-90">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          
          {filteredMenu.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="text-center py-20 opacity-40 italic font-display uppercase tracking-widest"
            >
              No matches for this fuel mode. Try another.
            </motion.div>
          )}
        </section>

        {/* Live Seat Map Section */}
        <section id="reserve" className="py-24 bg-cafe-charcoal/5">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
              >
                <h2 className="text-3xl md:text-5xl mb-6">Live Workspace Map</h2>
                <div className="w-24 h-1 bg-cafe-brick mb-8" />
                <p className="text-lg opacity-70 mb-8 leading-relaxed">
                  Real-time look at our floor plan. Find your favorite corner before you even walk through the brick facade.
                </p>
                
                <div className="space-y-4 mb-8">
                  {[
                    { status: 'available', label: 'Open for you', color: 'bg-green-500' },
                    { status: 'reserved', label: 'Booked soon', color: 'bg-orange-500' },
                    { status: 'occupied', label: 'Someone is grinding', color: 'bg-red-500' },
                  ].map(item => (
                    <div key={item.status} className="flex items-center space-x-3 text-sm font-display uppercase tracking-widest">
                      <div className={`w-3 h-3 rounded-full ${item.color} ${item.status === 'occupied' ? 'animate-pulse' : ''}`} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                
                <div className="p-8 bg-cafe-brick/10 rounded-2xl border border-cafe-brick/30 backdrop-blur-sm">
                  <h4 className="font-display text-sm mb-4">Currently in the cafe:</h4>
                  <div className="flex items-center justify-between font-display">
                    <span className="text-xs uppercase tracking-widest">Atmosphere Meter</span>
                    <span className="text-xs text-cafe-brick">VIBE: HIGH FOCUS</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full mt-2 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      whileInView={{ width: '75%' }}
                      className="bg-cafe-brick h-full shadow-[0_0_10px_#D2691E]" 
                    />
                  </div>
                </div>
              </motion.div>

              {/* Visual Floor Plan */}
              <div className="relative bg-cafe-charcoal rounded-[32px] md:rounded-[40px] p-4 md:p-12 shadow-2xl overflow-hidden aspect-square border-8 border-cafe-brick/20">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10px 10px, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                
                <div className="relative w-full h-full">
                  {/* Entrance */}
                  <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-3 h-16 md:w-4 md:h-24 bg-cafe-brick border-r-4 border-cafe-sand/20 flex items-center justify-center">
                    <span className="rotate-270 text-[6px] md:text-[8px] text-white tracking-[0.5em] font-display">ENTRANCE</span>
                  </div>

                  {/* Counter Bar */}
                  <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-white/5 border-l border-white/10 flex flex-col items-center justify-center gap-4 md:gap-8">
                    <Coffee className="text-white/20 rotate-12 w-6 h-6 md:w-10 md:h-10" />
                    <div className="w-1 h-20 md:h-32 bg-cafe-brick/20 rounded-full" />
                    <span className="rotate-90 text-[8px] md:text-[10px] text-white/30 tracking-widest font-display">ESPRESSO BAR</span>
                  </div>

                  {/* Tables Map */}
                  {tables.map(table => (
                    <motion.button
                      key={table.id}
                      onClick={() => toggleTableStatus(table.id)}
                      className="absolute group z-10"
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      style={{ 
                        left: `${table.x}%`, 
                        top: `${table.y}%`, 
                        translateX: '-50%', 
                        translateY: '-50%' 
                      }}
                    >
                      <div className={`relative table-indicator ${
                        table.capacity > 4 ? 'w-14 h-14 md:w-20 md:h-20' : table.capacity > 2 ? 'w-12 h-12 md:w-16 md:h-16' : 'w-10 h-10 md:w-12 md:h-12'
                      } ${
                        table.status === 'available' ? 'bg-green-500/20 border-green-500' : 
                        table.status === 'reserved' ? 'bg-orange-500/20 border-orange-500' : 'bg-red-500/20 border-red-500'
                      } border-2 rounded-xl md:rounded-2xl flex flex-col items-center justify-center backdrop-blur-md`}>
                        <Users size={table.capacity > 2 ? (window.innerWidth < 768 ? 14 : 20) : (window.innerWidth < 768 ? 10 : 14)} className={table.status === 'available' ? 'text-green-500' : table.status === 'reserved' ? 'text-orange-500' : 'text-red-500'} />
                        <span className="text-[8px] md:text-[10px] font-bold text-white mt-1">{table.capacity}</span>
                        
                        {/* Occupied Ripple */}
                        {table.status === 'occupied' && (
                          <div className="absolute inset-0 rounded-xl md:rounded-2xl border border-red-500 animate-ping opacity-20" />
                        )}
                      </div>
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-cafe-charcoal text-[8px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                        {table.status.toUpperCase()} (T#{table.id})
                      </div>
                    </motion.button>
                  ))}
                </div>
                
                <div className="absolute bottom-4 left-0 right-0 text-center text-[8px] md:text-[10px] text-white/30 uppercase tracking-[0.2em] md:tracking-[0.3em] font-display">
                  Tap table to toggle state
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Community Board Section */}
        <section id="community" className="py-24 bg-cafe-sand/10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
              >
                <h2 className="text-3xl md:text-5xl mb-6">The Community Corkboard</h2>
                <p className="text-lg opacity-70 mb-8 leading-relaxed">
                  We believe a cafe should be more than just a place to buy caffeine. 
                  It's a hub for ideas, music, and local connections. Check out what's 
                  pinning up this week at the Brick.
                </p>
                <div className="flex space-x-6">
                  <Instagram className="w-6 h-6 text-cafe-brick cursor-pointer hover:scale-110 transition-transform" />
                  <Facebook className="w-6 h-6 opacity-40 cursor-pointer hover:text-cafe-brick hover:opacity-100 transition-all" />
                  <a href="#" className="opacity-40 cursor-pointer hover:text-cafe-brick hover:opacity-100 transition-all">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                </div>
              </motion.div>

              <div className="corkboard p-8 rounded-xl shadow-inner min-h-[400px] grid grid-cols-1 md:grid-cols-2 gap-4">
                {COMMUNITY_EVENTS.map((event, idx) => (
                  <motion.div
                    key={event.title}
                    initial={{ rotate: idx % 2 === 0 ? -5 : 5, opacity: 0, scale: 0.8 }}
                    whileInView={{ rotate: idx % 2 === 0 ? -1 : 1, opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.05, rotate: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-[#fff9e6] p-6 shadow-md border-t-[12px] border-cafe-brick text-cafe-charcoal"
                  >
                    <span className="text-[10px] uppercase font-display text-cafe-brick/60 tracking-tighter">{event.tag}</span>
                    <h4 className="text-sm font-sans font-bold text-cafe-charcoal mt-1 mb-2 leading-tight uppercase">{event.title}</h4>
                    <div className="flex items-center text-xs text-cafe-charcoal/50">
                      <Calendar className="w-3 h-3 mr-1" />
                      {event.date}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <div className="w-2 h-2 bg-cafe-brick rounded-full opacity-50" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-cafe-charcoal text-white/40 py-12 px-6 border-t border-cafe-brick/10">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12 items-center">
          <div>
            <h4 className="text-white text-lg mb-4">Brick & Bean Cafe</h4>
            <p className="text-sm">123 Industrial Way, Arts District<br />Metropolis, NY 10001</p>
          </div>
          <div className="text-center">
            <h4 className="text-cafe-brick text-4xl font-display mb-2">B&B</h4>
            <p className="text-[10px] uppercase tracking-[0.3em]">Established 2024</p>
          </div>
          <div className="md:text-right text-xs uppercase tracking-widest">
            <p className="mb-2">© 2024 Brick & Bean Cafe</p>
            <button className="text-white hover:text-cafe-brick transition-colors">Privacy Policy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
