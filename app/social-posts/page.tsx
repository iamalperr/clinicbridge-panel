import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Calendar, Layout, Search, Users, UserPlus, CheckCircle, Smartphone, Activity, ArrowRightCircle, ChevronRight, X, Send } from 'lucide-react';

export default function SocialPostsPage() {
  const PostHeader = ({ title, subtitle }: { title: React.ReactNode, subtitle: string }) => (
    <div className="flex flex-col items-center text-center w-full max-w-[950px] mx-auto z-10 pt-16">
      <div className="flex items-center gap-3 mb-8 bg-slate-900/60 border border-slate-800 px-5 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
        <Bot className="w-5 h-5 text-teal-400" />
        <span className="text-white text-[17px] font-semibold tracking-wide">ClinicBridge <span className="text-teal-400">AI</span></span>
      </div>
      <h1 className="text-white text-[58px] font-extrabold leading-[1.15] mb-6 tracking-tight">
        {title}
      </h1>
      <p className="text-slate-400 text-[26px] leading-[1.5] max-w-[850px] font-medium">
        {subtitle}
      </p>
    </div>
  );

  return (
    <div className="bg-[#020617] min-h-screen p-10 flex flex-col items-center gap-16 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi */}
      <div id="post-1" className="w-[1200px] h-[1200px] shrink-0 bg-[#020617] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        {/* Abstract Background Elements */}
        <div className="absolute top-[-300px] right-[-300px] w-[1000px] h-[1000px] bg-teal-500/10 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute bottom-[-300px] left-[-300px] w-[1000px] h-[1000px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30"></div>

        <PostHeader 
          title={<>Klinik web siteleri neden <br/>sadece <span className="text-teal-400 border-b-4 border-teal-500/30 pb-1">broşür gibi</span> kalmamalı?</>}
          subtitle="Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, doğru yönlendirmeli ve aktif bir dönüşüm kanalına evrilmeli."
        />

        {/* Main Content - Two Mockups */}
        <div className="flex-1 flex items-center justify-center gap-10 w-full px-12 z-10 mt-10 mb-8">
          
          {/* Left Card: Static Website */}
          <div className="w-[480px] h-[600px] bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl flex flex-col relative overflow-hidden group">
            {/* Browser Header */}
            <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-5 gap-3">
              <div className="flex gap-2 opacity-50">
                <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              </div>
              <div className="flex-1 bg-slate-900 border border-slate-800 h-8 rounded-md flex items-center justify-center">
                <span className="text-slate-600 text-xs font-medium">www.sizin-klinik.com</span>
              </div>
            </div>
            {/* Dummy Website Content */}
            <div className="flex-1 p-6 flex flex-col gap-5 opacity-40 grayscale pointer-events-none">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div className="w-24 h-6 bg-slate-800 rounded"></div>
                <div className="flex gap-3">
                  <div className="w-12 h-2 bg-slate-800 rounded"></div>
                  <div className="w-12 h-2 bg-slate-800 rounded"></div>
                  <div className="w-16 h-2 bg-slate-800 rounded"></div>
                </div>
              </div>
              <div className="h-40 bg-slate-800 rounded-xl w-full"></div>
              <div className="flex flex-col gap-3 mt-2">
                <div className="h-6 bg-slate-800 rounded w-3/4"></div>
                <div className="h-3 bg-slate-800 rounded w-full"></div>
                <div className="h-3 bg-slate-800 rounded w-full"></div>
                <div className="h-3 bg-slate-800 rounded w-5/6"></div>
              </div>
              <div className="flex gap-4 mt-2">
                <div className="h-24 bg-slate-800 rounded-lg flex-1"></div>
                <div className="h-24 bg-slate-800 rounded-lg flex-1"></div>
              </div>
            </div>
            {/* Overlay */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm">
              <div className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-[19px] border border-slate-700 flex items-center gap-3 shadow-2xl">
                <Layout className="w-6 h-6 text-slate-500" />
                Statik & Pasif Web Sitesi
              </div>
              <p className="text-slate-400 mt-4 font-medium text-[16px] text-center px-8">
                Hasta bilgi arar, cevap bulamaz ve <br/>sayfayı terk eder. (Yüksek Bounce Rate)
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center justify-center z-10 shrink-0">
            <div className="w-14 h-14 rounded-full bg-teal-500/10 flex items-center justify-center border border-teal-500/30">
              <ArrowRight className="w-7 h-7 text-teal-400" />
            </div>
          </div>

          {/* Right Card: AI Enhanced Website */}
          <div className="w-[480px] h-[600px] bg-slate-900 rounded-2xl border border-teal-500/50 shadow-[0_0_80px_rgba(20,184,166,0.15)] flex flex-col relative overflow-hidden">
            {/* Browser Header */}
            <div className="h-14 bg-slate-950 border-b border-slate-800 flex items-center px-5 gap-3">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="flex-1 bg-slate-900 border border-slate-800 h-8 rounded-md flex items-center justify-center relative">
                <span className="text-slate-400 text-xs font-medium">www.sizin-klinik.com</span>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse"></div>
                   <span className="text-teal-500 text-[10px] font-bold tracking-wider">AI AKTİF</span>
                </div>
              </div>
            </div>

            {/* Dummy Website Background (Darker) */}
            <div className="flex-1 p-6 flex flex-col gap-5 opacity-20 pointer-events-none absolute inset-0 pt-20">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div className="w-24 h-6 bg-slate-700 rounded"></div>
              </div>
              <div className="h-40 bg-slate-700 rounded-xl w-full"></div>
              <div className="h-6 bg-slate-700 rounded w-3/4 mt-2"></div>
              <div className="h-3 bg-slate-700 rounded w-full"></div>
              <div className="h-3 bg-slate-700 rounded w-5/6"></div>
            </div>

            {/* AI Widget Overlay - Realistic ClinicBridge Widget */}
            <div className="absolute right-6 bottom-6 w-[360px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col z-30 border border-slate-200">
              
              {/* Widget Header */}
              <div className="bg-teal-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base leading-tight">Clinic Asistanı</h3>
                    <p className="text-teal-100 text-xs flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block"></span>
                      Çevrimiçi
                    </p>
                  </div>
                </div>
                <X className="w-5 h-5 text-white/70" />
              </div>

              {/* Chat Body */}
              <div className="p-4 bg-slate-50 flex flex-col gap-4 h-[280px] overflow-hidden">
                
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-sm text-slate-700 text-[14px] shadow-sm leading-snug">
                    Merhaba! Kliniğimize hoş geldiniz. Randevu almak veya tedaviler hakkında bilgi almak ister misiniz?
                  </div>
                </div>

                <div className="flex gap-2 self-end max-w-[85%]">
                  <div className="bg-teal-600 p-3 rounded-2xl rounded-tr-sm text-white text-[14px] shadow-sm leading-snug">
                    İmplant tedavisi fiyatları nedir?
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-sm text-slate-700 text-[14px] shadow-sm leading-snug">
                      İmplant tedavisi kişinin çene yapısına göre planlanır. Ortalama fiyatlar... 
                      <br/><br/>
                      Dilerseniz size ücretsiz ön muayene planlayabilirim. Sizi ilgili birimimize aktarayım mı?
                    </div>
                    {/* Quick Replies */}
                    <div className="flex flex-wrap gap-2 mt-1">
                      <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-1.5 rounded-full text-xs font-semibold">Randevu Al</div>
                      <div className="bg-teal-50 border border-teal-200 text-teal-700 px-3 py-1.5 rounded-full text-xs font-semibold">WhatsApp'a Bağlan</div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Input Area */}
              <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-10 px-4 flex items-center text-slate-400 text-sm">
                  Mesajınızı yazın...
                </div>
                <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-white -ml-0.5" />
                </div>
              </div>

            </div>

            {/* Badge */}
            <div className="absolute top-6 left-6 z-20">
              <div className="bg-teal-500/20 border border-teal-500/40 text-teal-300 px-4 py-2 rounded-lg font-bold text-sm backdrop-blur-md flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Etkileşimli Dönüşüm Kanalı
              </div>
            </div>

          </div>

        </div>

        {/* Footer CTA */}
        <div className="mt-auto border-t border-slate-800 bg-slate-900/40 py-8 flex flex-col items-center justify-center z-10 backdrop-blur-md">
          <div className="flex items-center gap-3 bg-teal-500/10 border border-teal-500/20 px-6 py-2.5 rounded-full mb-2">
            <CheckCircle className="w-5 h-5 text-teal-400" />
            <span className="text-teal-50 font-medium text-lg">Ziyaretçiyi 7/24 karşılar, filtreler ve nitelikli randevuya dönüştürür.</span>
          </div>
          <div className="text-slate-500 font-bold text-[16px] tracking-[0.2em] uppercase mt-2">
            clinicbridge.ai
          </div>
        </div>
      </div>


      {/* POST 2 (Hidden for now to focus on Post 1) */}
      <div id="post-2" className="hidden"></div>
      <div id="post-3" className="hidden"></div>
      <div id="post-4" className="hidden"></div>
      <div id="post-5" className="hidden"></div>

    </div>
  );
}
