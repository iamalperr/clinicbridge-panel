import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Calendar, Layout, Search, Users, UserPlus, CheckCircle, Smartphone, Activity, ArrowRightCircle } from 'lucide-react';

export default function SocialPostsPage() {
  // Shared Header Component
  const PostHeader = ({ title, subtitle }: { title: React.ReactNode, subtitle: string }) => (
    <div className="flex flex-col items-center text-center w-full max-w-[900px] mx-auto z-10 pt-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <span className="text-white text-2xl font-bold tracking-tight">ClinicBridge <span className="text-teal-400">AI</span></span>
      </div>
      <h1 className="text-white text-[56px] font-bold leading-[1.2] mb-6">
        {title}
      </h1>
      <p className="text-slate-300 text-[26px] leading-[1.5] max-w-[800px]">
        {subtitle}
      </p>
    </div>
  );

  return (
    <div className="bg-slate-950 min-h-screen p-10 flex flex-col items-center gap-16 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi */}
      <div id="post-1" className="w-[1200px] h-[1200px] shrink-0 bg-[#0B1120] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        {/* Background glow */}
        <div className="absolute top-[-200px] right-[-200px] w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-200px] left-[-200px] w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px]"></div>

        <PostHeader 
          title={<>Klinik web siteleri neden sadece <br/><span className="text-teal-400">broşür gibi</span> kalmamalı?</>}
          subtitle="Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, yönlendirmeli ve aksiyona dönüştürmeli."
        />

        {/* Main Content - Two Cards */}
        <div className="flex-1 flex items-center justify-center gap-8 w-full px-16 z-10 mt-8 mb-12">
          
          {/* Left Card: Statik */}
          <div className="w-[460px] h-[500px] bg-slate-900 rounded-3xl border border-slate-800 shadow-xl flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/80 z-10"></div>
            <div className="h-16 border-b border-slate-800 flex items-center px-6">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
              </div>
            </div>
            <div className="p-8 flex flex-col gap-6 opacity-40 grayscale">
              <div className="h-32 bg-slate-800 rounded-xl w-full"></div>
              <div className="h-6 bg-slate-800 rounded w-3/4"></div>
              <div className="h-4 bg-slate-800 rounded w-full"></div>
              <div className="h-4 bg-slate-800 rounded w-5/6"></div>
              <div className="h-4 bg-slate-800 rounded w-4/6"></div>
            </div>
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="bg-slate-800/90 backdrop-blur-md text-white px-6 py-3 rounded-full font-bold text-xl border border-slate-700 flex items-center gap-3">
                <Layout className="w-6 h-6 text-slate-400" />
                Statik Web Sitesi
              </div>
              <p className="text-slate-400 mt-4 font-medium text-lg">Pasif Broşür Görünümü</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center justify-center w-20 z-10">
            <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center border border-teal-500/30">
              <ArrowRight className="w-8 h-8 text-teal-400" />
            </div>
          </div>

          {/* Right Card: AI */}
          <div className="w-[460px] h-[500px] bg-slate-900 rounded-3xl border border-teal-500/40 shadow-[0_0_60px_rgba(20,184,166,0.15)] flex flex-col relative overflow-hidden">
            <div className="h-16 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-800/50">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full">Canlı</div>
            </div>
            <div className="p-8 flex flex-col gap-6 relative h-full">
              <div className="h-32 bg-gradient-to-r from-teal-900/50 to-slate-800 rounded-xl w-full flex items-center p-6 border border-teal-500/20">
                <div className="flex-1">
                  <div className="h-6 bg-teal-500/30 rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-teal-500/20 rounded w-1/2"></div>
                </div>
                <div className="bg-teal-500 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-teal-500/30">
                  Randevu Al
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col justify-center items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-teal-400" />
                  <div className="h-2 w-12 bg-slate-600 rounded"></div>
                </div>
                <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col justify-center items-center gap-2">
                  <Clock className="w-6 h-6 text-teal-400" />
                  <div className="h-2 w-12 bg-slate-600 rounded"></div>
                </div>
              </div>

              {/* Chatbot overlay mockup */}
              <div className="absolute bottom-6 right-6 w-64 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
                <div className="bg-teal-500 p-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="text-white text-sm font-bold">ClinicBridge AI</span>
                </div>
                <div className="p-4 flex flex-col gap-3 bg-slate-900/50">
                  <div className="bg-slate-700 text-white text-[13px] p-2.5 rounded-xl rounded-tl-none w-[85%]">
                    Nasıl yardımcı olabilirim?
                  </div>
                  <div className="bg-teal-500 text-white text-[13px] p-2.5 rounded-xl rounded-tr-none w-[75%] self-end">
                    İmplant fiyatları?
                  </div>
                </div>
              </div>

            </div>
            
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity">
               {/* Hover reveal or just static overlay if needed, keeping it clean */}
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center">
              <div className="bg-teal-500 text-white px-6 py-3 rounded-full font-bold text-xl shadow-xl flex items-center gap-3">
                <Bot className="w-6 h-6" />
                AI Destekli Deneyim
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="w-full bg-slate-900/80 border-t border-slate-800 py-6 px-16 flex justify-between items-center z-10 backdrop-blur-md">
          <div className="text-teal-400 font-medium text-xl flex items-center gap-3">
            <CheckCircle className="w-6 h-6" />
            ClinicBridge AI ile web sitenizi aktif hasta kazanım kanalına dönüştürün.
          </div>
          <div className="text-slate-500 font-bold text-xl tracking-wide">
            clinicbridge.ai
          </div>
        </div>
      </div>

      {/* POST 2: İlk 30 Saniye */}
      <div id="post-2" className="w-[1200px] h-[1200px] shrink-0 bg-[#0B1120] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-[-100px] w-[600px] h-[600px] bg-teal-500/15 rounded-full blur-[100px]"></div>

        <PostHeader 
          title={<>Bir hasta web sitenize geldiğinde <br/><span className="text-teal-400">ilk 30 saniyede</span> ne arar?</>}
          subtitle="Güven, net bilgi ve hızlı yönlendirme. İlk temas anı, dönüşümün en kritik noktasıdır."
        />

        {/* Main Content */}
        <div className="flex-1 w-full relative mt-12 flex justify-center items-end px-20">
          
          {/* Web interface Mockup */}
          <div className="w-[900px] h-[550px] bg-slate-900 rounded-t-3xl border-t border-l border-r border-slate-700 shadow-2xl relative flex flex-col">
            {/* Browser Header */}
            <div className="h-14 border-b border-slate-800 flex items-center px-6 gap-4 bg-slate-950/50">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                <div className="w-3 h-3 rounded-full bg-slate-700"></div>
              </div>
              <div className="flex-1 bg-slate-800 h-8 rounded-md flex items-center px-4">
                <span className="text-slate-500 text-sm">sizin-klinik.com</span>
              </div>
            </div>
            {/* Content area */}
            <div className="p-10 flex flex-col gap-8 relative h-full">
              <div className="flex gap-8 items-start">
                <div className="flex-1 flex flex-col gap-6">
                  <div className="h-12 bg-slate-800 rounded-lg w-3/4"></div>
                  <div className="h-6 bg-slate-800/50 rounded w-full"></div>
                  <div className="h-6 bg-slate-800/50 rounded w-5/6"></div>
                  <div className="w-40 h-12 bg-teal-500/20 border border-teal-500/30 rounded-lg mt-4"></div>
                </div>
                <div className="w-[300px] h-[250px] bg-slate-800 rounded-2xl"></div>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div className="h-32 bg-slate-800 rounded-xl"></div>
                <div className="h-32 bg-slate-800 rounded-xl"></div>
                <div className="h-32 bg-slate-800 rounded-xl"></div>
              </div>
            </div>

            {/* CALLOUTS */}
            <div className="absolute top-20 left-10 bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl p-4 flex items-center gap-4 -translate-x-1/3">
              <div className="w-12 h-12 bg-teal-500/20 rounded-full flex items-center justify-center text-teal-400">
                <Search className="w-6 h-6" />
              </div>
              <span className="font-bold text-white text-xl">Hangi tedaviler var?</span>
            </div>

            <div className="absolute top-48 right-16 bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl p-4 flex items-center gap-4 translate-x-1/4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <span className="font-bold text-white text-xl">Fiyat / ön bilgi alabilir miyim?</span>
            </div>

            <div className="absolute bottom-40 left-20 bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl p-4 flex items-center gap-4 -translate-x-1/4">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
                <Calendar className="w-6 h-6" />
              </div>
              <span className="font-bold text-white text-xl">Nasıl randevu alırım?</span>
            </div>
            
            <div className="absolute bottom-20 right-40 bg-slate-800 border border-slate-600 shadow-2xl rounded-2xl p-4 flex items-center gap-4 translate-x-1/4">
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="font-bold text-white text-xl">Klinik güvenilir mi?</span>
            </div>

            {/* Chatbot Widget Bottom Right */}
            <div className="absolute -right-8 bottom-12 w-80 bg-slate-900 border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden flex flex-col z-20">
              <div className="bg-teal-500 p-4 flex items-center gap-3">
                <Bot className="w-6 h-6 text-white" />
                <span className="text-white font-bold text-lg">ClinicBridge AI</span>
              </div>
              <div className="p-6 bg-slate-800">
                <div className="bg-slate-700 p-4 rounded-2xl rounded-tl-none text-white text-lg shadow-sm">
                  Merhaba, size nasıl yardımcı olabilirim?
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-4 bg-teal-500"></div>
      </div>

      {/* POST 3: WhatsApp Yönlendirme */}
      <div id="post-3" className="w-[1200px] h-[1200px] shrink-0 bg-[#0B1120] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-30"></div>

        <PostHeader 
          title={<>WhatsApp’a yönlendirmek <span className="text-teal-400">yeterli mi?</span> <br/><span className="text-[40px] text-slate-300 mt-4 block">Yoksa önce doğru ön bilgilendirme mi gerekir?</span></>}
          subtitle="Her ziyaretçiyi aynı kanala göndermek yerine, önce ihtiyacı anlayan bir akış kurmak daha yüksek dönüşüm sağlar."
        />

        {/* Main Content */}
        <div className="flex-1 flex justify-center items-center gap-16 px-16 z-10 pb-16 mt-4">
          
          {/* Left Flow - Classic */}
          <div className="w-[420px] bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-10 flex flex-col items-center">
            <div className="text-slate-400 font-bold text-2xl mb-12 uppercase tracking-widest">Sadece Yönlendirme</div>
            
            <div className="w-full bg-slate-800 rounded-2xl p-8 flex items-center justify-center gap-4 border border-slate-700">
              <Layout className="w-10 h-10 text-slate-400" />
              <span className="text-white text-3xl font-bold">Web Sitesi</span>
            </div>
            
            <div className="w-1 h-20 bg-slate-700 my-2"></div>
            <ArrowRight className="w-10 h-10 text-slate-600 rotate-90" />
            <div className="w-1 h-20 bg-slate-700 my-2"></div>

            <div className="w-full bg-slate-800 rounded-2xl p-8 flex items-center justify-center gap-4 border border-slate-700">
              <MessageSquare className="w-10 h-10 text-green-500" />
              <span className="text-white text-3xl font-bold">WhatsApp</span>
            </div>

            <div className="mt-12 w-full flex flex-col gap-4">
              <div className="bg-red-500/10 text-red-400 p-4 rounded-xl text-center font-semibold text-lg border border-red-500/20">Ön eleme yok</div>
              <div className="bg-red-500/10 text-red-400 p-4 rounded-xl text-center font-semibold text-lg border border-red-500/20">Hazırlıksız ziyaretçi</div>
            </div>
          </div>

          <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-2xl z-20">
            VS
          </div>

          {/* Right Flow - AI */}
          <div className="w-[480px] bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-teal-500/40 p-10 flex flex-col items-center shadow-[0_0_60px_rgba(20,184,166,0.15)] relative">
            <div className="absolute -top-6 bg-teal-500 text-white px-8 py-3 rounded-full font-bold text-xl shadow-xl">
              Akıllı Ön Bilgilendirme
            </div>
            <div className="text-teal-400 font-bold text-2xl mb-10 uppercase tracking-widest mt-6">ClinicBridge AI Akışı</div>
            
            <div className="w-full bg-slate-800 rounded-2xl p-6 flex items-center justify-center gap-4 border border-slate-700">
              <Layout className="w-8 h-8 text-white" />
              <span className="text-white text-2xl font-bold">Web Sitesi</span>
            </div>

            <div className="w-1 h-8 bg-teal-500/50 my-2"></div>
            
            {/* Mock Chat Flow */}
            <div className="w-[110%] bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden my-2 relative z-10">
              <div className="bg-teal-500 p-4 flex items-center gap-3">
                <Bot className="w-6 h-6 text-white" />
                <span className="text-white font-bold text-lg">AI Ön Bilgilendirme</span>
              </div>
              <div className="p-6 flex flex-col gap-4 bg-slate-900/50">
                <div className="bg-slate-700 p-3.5 rounded-2xl rounded-tl-none text-white text-[15px] shadow-sm">
                  Hangi tedaviyle ilgileniyorsunuz?
                </div>
                <div className="bg-teal-500 text-white p-3.5 rounded-2xl rounded-tr-none text-[15px] shadow-sm self-end">
                  İmplant tedavisi.
                </div>
                <div className="bg-slate-700 p-3.5 rounded-2xl rounded-tl-none text-white text-[15px] shadow-sm">
                  Harika, sizi uzmanımıza aktarayım...
                </div>
              </div>
            </div>

            <div className="w-1 h-8 bg-teal-500/50 my-2"></div>

            <div className="w-full bg-teal-500/20 rounded-2xl p-6 flex items-center justify-center gap-4 border border-teal-500/50">
              <Calendar className="w-8 h-8 text-teal-400" />
              <span className="text-white text-2xl font-bold">Nitelikli Randevu</span>
            </div>
          </div>

        </div>
      </div>

      {/* POST 4: Ekip Yükü Azaltma */}
      <div id="post-4" className="w-[1200px] h-[1200px] shrink-0 bg-[#0B1120] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[150px]"></div>

        <PostHeader 
          title={<>AI destekli hasta iletişimi <br/><span className="text-teal-400">klinik ekiplerinin</span> yükünü nasıl azaltır?</>}
          subtitle="Tekrarlayan soruları azaltın, ilk temas sürecini hızlandırın, ekibinizi daha verimli çalıştırın."
        />

        <div className="flex-1 flex w-full max-w-[1050px] mx-auto items-center mt-8 mb-16 z-10 gap-8">
          
          {/* Left Column */}
          <div className="w-[30%] flex flex-col gap-6">
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div className="text-slate-400 font-bold mb-4 flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" /> Gelen Talepler
              </div>
              <div className="flex flex-col gap-4">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <div className="h-3 w-16 bg-slate-700 rounded mb-2"></div>
                      <div className="h-2 w-24 bg-slate-800 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Middle Column AI Filter */}
          <div className="w-[35%] flex flex-col items-center">
            <div className="bg-teal-500 w-32 h-32 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(20,184,166,0.4)] mb-10 relative">
              <Bot className="w-16 h-16 text-white" />
              <div className="absolute -top-4 -right-6 bg-slate-800 text-teal-400 text-sm font-bold px-4 py-2 rounded-full border border-teal-500/30">
                Filtreliyor
              </div>
            </div>
            
            <div className="flex flex-col gap-4 w-full">
              <div className="bg-slate-800 border-l-4 border-teal-500 p-5 rounded-r-xl font-bold text-white text-lg flex items-center gap-4 shadow-lg">
                <CheckCircle className="w-6 h-6 text-teal-500" />
                Sık sorulara anında yanıt
              </div>
              <div className="bg-slate-800 border-l-4 border-blue-500 p-5 rounded-r-xl font-bold text-white text-lg flex items-center gap-4 shadow-lg">
                <CheckCircle className="w-6 h-6 text-blue-500" />
                İlk bilgilendirme otomasyonu
              </div>
              <div className="bg-slate-800 border-l-4 border-indigo-500 p-5 rounded-r-xl font-bold text-white text-lg flex items-center gap-4 shadow-lg">
                <CheckCircle className="w-6 h-6 text-indigo-500" />
                Randevu ön eleme
              </div>
            </div>
          </div>

          {/* Right Column Dashboard */}
          <div className="w-[35%] flex flex-col">
            <div className="bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden h-[450px]">
              <div className="bg-slate-800 p-5 border-b border-slate-700 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-teal-400" />
                <span className="text-white font-bold text-xl">Rahatlayan Ekip Paneli</span>
              </div>
              <div className="p-6 flex flex-col gap-6 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm font-medium mb-2">Cevaplanan</div>
                    <div className="text-3xl font-bold text-white">142</div>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="text-slate-400 text-sm font-medium mb-2">Randevu</div>
                    <div className="text-3xl font-bold text-teal-400">28</div>
                  </div>
                </div>
                <div className="bg-slate-800 flex-1 rounded-xl border border-slate-700 p-5">
                  <div className="text-white font-bold mb-4">Nitelikli Talepler</div>
                  <div className="flex flex-col gap-3">
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                      <div className="h-3 w-24 bg-slate-700 rounded"></div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                      <div className="h-3 w-32 bg-slate-700 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* POST 5: 5 Dijital Temas Noktası */}
      <div id="post-5" className="w-[1200px] h-[1200px] shrink-0 bg-[#0B1120] relative overflow-hidden flex flex-col border border-slate-800 shadow-2xl">
        <PostHeader 
          title={<>Kliniklerde randevu dönüşüm oranını artıran <br/><span className="text-teal-400">5 dijital temas noktası</span></>}
          subtitle="Doğru dijital temas noktaları, ziyaretçiyi yalnızca bilgilendirmez; onu aksiyona taşır."
        />

        <div className="flex-1 w-full max-w-[900px] mx-auto mt-8 mb-16 relative flex flex-col gap-6 z-10">
          
          <div className="absolute left-[38px] top-10 bottom-10 w-1 bg-gradient-to-b from-teal-500/20 via-teal-500 to-teal-500/20 z-0"></div>

          {/* Steps */}
          {[
            { num: 1, icon: Layout, title: "Web sitesi ilk karşılama", desc: "Ziyaretçiyi 30 saniye içinde güven ve doğru tasarımla karşılamak.", color: "text-slate-400", bg: "bg-slate-800", border: "border-slate-700" },
            { num: 2, icon: Bot, title: "Akıllı soru-cevap / Chatbot", desc: "Ziyaretçinin sorularına 7/24 anında ve doğru dilde yanıt vermek.", color: "text-white", bg: "bg-teal-600", border: "border-teal-500 shadow-[0_0_20px_rgba(20,184,166,0.3)]" },
            { num: 3, icon: Search, title: "Hızlı ön bilgilendirme", desc: "Fiyat, süreç ve uzmanlar hakkında özet bilgiyi anında sağlamak.", color: "text-blue-400", bg: "bg-slate-800", border: "border-slate-700" },
            { num: 4, icon: ArrowRightCircle, title: "Doğru iletişim kanalına yönlendirme", desc: "Ziyaretçinin niyetine göre WhatsApp veya çağrı merkezine aktarım.", color: "text-indigo-400", bg: "bg-slate-800", border: "border-slate-700" },
            { num: 5, icon: Calendar, title: "Randevu / Demo talep aksiyonu", desc: "Isınan hastayı doğrudan nitelikli bir randevuya dönüştürmek.", color: "text-white", bg: "bg-teal-600", border: "border-teal-500 shadow-[0_0_20px_rgba(20,184,166,0.3)]" }
          ].map((step, idx) => (
            <div key={idx} className="flex items-center gap-8 relative z-10">
              <div className={`w-[80px] h-[80px] shrink-0 rounded-full bg-slate-900 border-4 ${step.border} flex items-center justify-center text-white font-bold text-3xl`}>
                {step.num}
              </div>
              <div className="flex-1 bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700 flex items-center gap-6 shadow-xl hover:border-slate-500 transition-colors">
                <div className={`w-16 h-16 shrink-0 rounded-xl ${step.bg} flex items-center justify-center ${step.color}`}>
                  <step.icon className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-white font-bold text-[24px] leading-tight">{step.title}</h3>
                  <p className="text-slate-400 text-[18px] leading-snug">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}

        </div>

      </div>

    </div>
  );
}
