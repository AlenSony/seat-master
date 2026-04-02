import heroImage from '@/assets/hero-train.jpg';
import Navbar from '@/components/Navbar';
import { getStoredUser } from '@/lib/api';
import { ArrowRight, CheckCircle2, ChevronDown, LayoutDashboard, MapPin, Shield, Ticket, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@gmail.com';
  const isTC = user?.role === 'tc';
  const features = [
    {
      icon: MapPin,
      title: 'Visual Seat Selection',
      description: 'Choose your exact seat from an interactive coach layout with real-time availability.',
      delay: '0s'
    },
    {
      icon: Zap,
      title: 'Instant Booking',
      description: 'Complete your reservation in seconds with our streamlined booking flow.',
      delay: '0.1s'
    },
    {
      icon: Shield,
      title: 'Secure Payments',
      description: 'Your transactions are protected with bank-grade encryption.',
      delay: '0.2s'
    },
    {
      icon: Users,
      title: 'Group Travel',
      description: 'Easily book adjacent seats for family and friends traveling together.',
      delay: '0.3s'
    }
  ];

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">
      <Navbar />


      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Background Parallax Effect */}
        <div className="absolute inset-0 z-0">
          <img 
            src={heroImage} 
            alt="Modern train journey" 
            className="w-full h-full object-cover animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/20" />
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-full text-sm font-semibold mb-8 backdrop-blur-md shadow-sm animate-fade-in hover:bg-primary/20 transition-colors cursor-default">
              <Zap className="w-4 h-4 fill-primary" />
              <span>The future of train travel is here</span>
            </div>
            
            <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl font-bold text-foreground mb-8 leading-[1.1] tracking-tight animate-slide-up">
              Journey with <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-500 to-indigo-600 animate-shine">
                Confidence
              </span>
            </h1>
            
            <p className="text-lg md:text-2xl text-muted-foreground mb-10 max-w-2xl leading-relaxed animate-slide-up opacity-0" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              Experience the next generation of train booking. 
              <span className="text-foreground font-medium"> Visual seat selection</span>, 
              <span className="text-foreground font-medium"> instant confirmation</span>, and 
              <span className="text-foreground font-medium"> premium comfort</span>.
            </p>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 animate-slide-up opacity-0" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
              {isAdmin ? (
                /* ── Admin Dashboard button ── */
                <button
                  onClick={() => navigate('/admin')}
                  className="relative flex items-center px-8 py-4 overflow-hidden font-semibold text-lg transition-all bg-indigo-600 rounded-xl group shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
                >
                  {/* top-right corner sweep */}
                  <span className="absolute top-0 right-0 inline-block w-5 h-5 transition-all duration-500 ease-in-out bg-indigo-800 rounded group-hover:-mr-5 group-hover:-mt-5">
                    <span className="absolute top-0 right-0 w-6 h-6 rotate-45 translate-x-1/2 -translate-y-1/2 bg-white" />
                  </span>
                  {/* bottom-left corner sweep */}
                  <span className="absolute bottom-0 rotate-180 left-0 inline-block w-5 h-5 transition-all duration-500 ease-in-out bg-indigo-800 rounded group-hover:-ml-5 group-hover:-mb-5">
                    <span className="absolute top-0 right-0 w-6 h-6 rotate-45 translate-x-1/2 -translate-y-1/2 bg-white" />
                  </span>
                  {/* full-width slide overlay */}
                  <span className="absolute bottom-0 left-0 w-full h-full transition-all duration-500 ease-in-out delay-200 -translate-x-full bg-indigo-700 rounded-xl group-hover:translate-x-0" />
                  <span className="relative flex items-center gap-2 text-white">
                    <LayoutDashboard className="w-5 h-5" />
                    Go to Admin Dashboard
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </button>
              ) : isTC ? (
                /* ── TC Dashboard button ── */
                <button
                  onClick={() => navigate('/tc-dashboard')}
                  className="relative flex items-center px-8 py-4 overflow-hidden font-semibold text-lg transition-all bg-blue-600 rounded-xl group shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                >
                  <span className="absolute top-0 right-0 inline-block w-5 h-5 transition-all duration-500 ease-in-out bg-blue-800 rounded group-hover:-mr-5 group-hover:-mt-5">
                    <span className="absolute top-0 right-0 w-6 h-6 rotate-45 translate-x-1/2 -translate-y-1/2 bg-white" />
                  </span>
                  <span className="absolute bottom-0 rotate-180 left-0 inline-block w-5 h-5 transition-all duration-500 ease-in-out bg-blue-800 rounded group-hover:-ml-5 group-hover:-mb-5">
                    <span className="absolute top-0 right-0 w-6 h-6 rotate-45 translate-x-1/2 -translate-y-1/2 bg-white" />
                  </span>
                  <span className="absolute bottom-0 left-0 w-full h-full transition-all duration-500 ease-in-out delay-200 -translate-x-full bg-blue-700 rounded-xl group-hover:translate-x-0" />
                  <span className="relative flex items-center gap-2 text-white">
                    <LayoutDashboard className="w-5 h-5" />
                    Go to TC Dashboard
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </button>
              ) : ( 
                /* ── Regular user: dual CTAs ── */
                <>
                  {/* Unreserved Booking — high-visibility emerald-teal gradient */}
                  <button
                    onClick={() => navigate('/gen-booking')}
                    className="hero-explore-btn"
                  >
                    <svg className="hero-explore-svg" viewBox="0 0 512 512" height="1em" xmlns="http://www.w3.org/2000/svg">
                      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.2 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
                    </svg>
                    Book Unreserved
                  </button>

                  {/* Reserved (Seat) Booking — compass spin pill */}
                  <button
                    onClick={() => navigate('/book')}
                    className="hero-explore-btn"
                  >
                    <svg className="hero-explore-svg" viewBox="0 0 512 512" height="1em" xmlns="http://www.w3.org/2000/svg">
                      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.2 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
                    </svg>
                    Book Reserved
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Floating Abstract Elements */}
        <div className="absolute top-1/4 right-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-1/4 left-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce cursor-pointer" onClick={scrollToFeatures}>
          <div className="p-2 rounded-full bg-background/50 backdrop-blur border border-border/50 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 bg-secondary/30 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20">
            <span className="text-sm font-bold text-primary uppercase tracking-widest">Why RailSeat?</span>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mt-3 mb-6">
              Redefining Your Journey
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              We've reimagined every step of the booking process to be faster, simpler, and more transparent.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div 
                key={feature.title}
                className="group p-8 bg-background rounded-2xl border border-border/50 shadow-sm hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-2 transition-all duration-500 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full -mr-16 -mt-16 transition-all group-hover:scale-150 duration-700" />
                
                <div className="relative w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 animate-float" style={{ animationDelay: feature.delay }}>
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                
                <h3 className="font-display font-bold text-xl text-foreground mb-3 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-32 bg-background relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-24">
            <span className="text-sm font-bold text-primary uppercase tracking-widest">Simple Process</span>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mt-3 mb-6">
              Start your journey in 3 steps
            </h2>
          </div>
          
          <div className="relative max-w-5xl mx-auto">
             {/* Connecting Line */}
            <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            
            <div className="grid md:grid-cols-3 gap-12">
              {[
                { step: '01', title: 'Search', desc: 'Find the perfect train for your schedule', icon: MapPin },
                { step: '02', title: 'Select', desc: 'Pick your preferred seat visually', icon: CheckCircle2 },
                { step: '03', title: 'Travel', desc: 'Get your e-ticket instantly', icon: Ticket }
              ].map((item, index) => (
                <div key={item.step} className="relative flex flex-col items-center text-center group">
                  <div className="w-24 h-24 rounded-full bg-background border-4 border-secondary flex items-center justify-center relative z-10 mb-8 group-hover:border-primary/50 group-hover:scale-110 transition-all duration-500 shadow-xl shadow-secondary/50">
                    <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <item.icon className="w-8 h-8 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg">
                      {item.step}
                    </div>
                  </div>
                  
                  <h3 className="font-display font-bold text-2xl text-foreground mb-3">{item.title}</h3>
                  <p className="text-muted-foreground text-lg max-w-xs">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer id="support" className="py-16 bg-card border-t border-border mt-auto">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <img src="/logo (2).png" alt="RailSeat Logo" className="h-12 w-auto object-contain" />
                <span className="font-display font-bold text-2xl text-foreground">RailSeat</span>
              </div>
              <p className="text-muted-foreground max-w-md leading-relaxed">
                RailSeat is transforming how people travel by train. With our intuitive visual booking system, 
                you're always in control of your journey.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-foreground mb-6">Quick Links</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Features</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Blog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-foreground mb-6">Support</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-sm text-muted-foreground font-medium">
              © 2025 RailSeat Inc. All rights reserved.
            </p>
            <div className="flex gap-6">
              {/* Social icons placeholders */}
              <div className="w-8 h-8 rounded-full bg-secondary hover:bg-primary/20 hover:text-primary flex items-center justify-center transition-colors cursor-pointer text-muted-foreground">
                <Users className="w-4 h-4" />
              </div>
              <div className="w-8 h-8 rounded-full bg-secondary hover:bg-primary/20 hover:text-primary flex items-center justify-center transition-colors cursor-pointer text-muted-foreground">
                <Zap className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
