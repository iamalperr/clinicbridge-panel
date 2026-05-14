import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Activity, Calendar, Layout, Smartphone, CheckCircle, Search, Users, Zap, UserPlus } from 'lucide-react';

export default function SocialPostsPage() {
  return (
    <div className="bg-slate-100 min-h-screen p-10 flex flex-col items-center gap-10 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi */}
      <div id="post-1" className="w-[1200px] h-[1200px] bg-[#0f172a] relative overflow-hidden flex flex-col justify-between p-16">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4"></div>

        {/* Header */}
        <div className="z-10 mt-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <span className="text-white text-3xl font-bold tracking-tight">ClinicBridge <span className="text-teal-400">AI</span></span>
          </div>
          <h1 className="text-white text-6xl font-bold leading-tight max-w-[900px] mb-6">
            Klinik web siteleri neden sadece <span className="text-teal-400">broşür gibi</span> kalmamalı?
          </h1>
          <p className="text-slate-300 text-2xl max-w-[800px] leading-relaxed">
            Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, yönlendirmeli ve aksiyona dönüştürmeli.
          </p>
        </div>

        {/* Main Content */}
        <div className="z-10 flex-1 flex items-center justify-between mt-16 gap-8">
          {/* Old Approach */}
          <div className="w-[45%] h-[550px] bg-white rounded-3xl p-6 shadow-2xl relative border border-slate-200">
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <div className="ml-4 h-6 w-48 bg-slate-100 rounded"></div>
            </div>
            <div className="flex flex-col gap-6 opacity-60 grayscale">
              <div className="h-32 w-full bg-slate-100 rounded-xl"></div>
              <div className="h-8 w-3/4 bg-slate-100 rounded"></div>
              <div className="h-4 w-full bg-slate-100 rounded"></div>
              <div className="h-4 w-full bg-slate-100 rounded"></div>
              <div className="h-4 w-2/3 bg-slate-100 rounded"></div>
            </div>
            <div className="absolute inset-0 bg-slate-900/5 rounded-3xl flex items-center justify-center backdrop-blur-[1px]">
              <div className="bg-slate-800 text-white px-6 py-3 rounded-full font-semibold text-lg flex items-center gap-2">
                <Layout className="w-5 h-5" />
                Statik & Pasif
              </div>
            </div>
          </div>

          {/* Arrows */}
          <div className="flex flex-col items-center gap-4 text-teal-400">
            <Activity className="w-12 h-12" />
            <ArrowRight className="w-12 h-12" />
          </div>

          {/* New Approach */}
          <div className="w-[45%] h-[550px] bg-white rounded-3xl p-6 shadow-[0_0_50px_rgba(20,184,166,0.3)] relative border border-teal-100 flex flex-col">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <div className="ml-4 h-6 w-48 bg-slate-50 rounded"></div>
            </div>
            <div className="flex-1 flex flex-col relative">
              <div className="h-32 w-full bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl mb-6 relative overflow-hidden flex items-center p-6">
                <div className="w-1/2">
                  <div className="h-6 w-3/4 bg-teal-200 rounded mb-2"></div>
                  <div className="h-4 w-1/2 bg-teal-100 rounded"></div>
                </div>
                <div className="ml-auto w-32 h-10 bg-teal-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  Randevu Al
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 bg-slate-50 rounded-xl border border-slate-100 p-4 flex flex-col justify-between">
                  <ShieldCheck className="w-6 h-6 text-teal-500" />
                  <div className="h-3 w-16 bg-slate-200 rounded"></div>
                </div>
                <div className="h-24 bg-slate-50 rounded-xl border border-slate-100 p-4 flex flex-col justify-between">
                  <Clock className="w-6 h-6 text-blue-500" />
                  <div className="h-3 w-16 bg-slate-200 rounded"></div>
                </div>
              </div>
              {/* Chatbot Widget Widget */}
              <div className="absolute bottom-0 right-0 w-64 bg-white shadow-xl border border-slate-100 rounded-2xl overflow-hidden translate-x-8 translate-y-8">
                <div className="bg-teal-500 p-3 flex items-center gap-3">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="text-white font-medium text-sm">AI Asistan</span>
                </div>
                <div className="p-4 bg-slate-50 flex flex-col gap-3 h-32">
                  <div className="bg-white p-2 rounded-lg text-xs shadow-sm border border-slate-100 w-[85%]">
                    Size nasıl yardımcı olabilirim?
                  </div>
                  <div className="bg-teal-500 text-white p-2 rounded-lg text-xs shadow-sm w-[75%] self-end">
                    Tedavileriniz neler?
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -top-4 -right-4 bg-teal-500 text-white px-6 py-2 rounded-full font-bold text-lg shadow-lg flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Etkileşimli & Aktif
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="z-10 flex justify-between items-center border-t border-slate-800 pt-8 mt-8">
          <div className="flex gap-8">
            <span className="flex items-center gap-2 text-slate-400 font-medium text-lg"><CheckCircle className="w-5 h-5 text-teal-500"/> Bilgi</span>
            <span className="flex items-center gap-2 text-slate-400 font-medium text-lg"><CheckCircle className="w-5 h-5 text-teal-500"/> Yönlendirme</span>
            <span className="flex items-center gap-2 text-slate-400 font-medium text-lg"><CheckCircle className="w-5 h-5 text-teal-500"/> Dönüşüm</span>
          </div>
          <div className="text-slate-500 font-medium text-lg">clinicbridge.ai</div>
        </div>
      </div>


      {/* POST 2: İlk 30 Saniye */}
      <div id="post-2" className="w-[1200px] h-[1200px] bg-white relative overflow-hidden flex flex-col justify-between p-16">
        <div className="absolute top-0 left-0 w-full h-[400px] bg-[#0f172a]"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>

        {/* Header */}
        <div className="z-10 mt-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <span className="text-white text-3xl font-bold tracking-tight">ClinicBridge <span className="text-teal-400">AI</span></span>
          </div>
          <h1 className="text-white text-6xl font-bold leading-tight max-w-[1000px] mb-6">
            Bir hasta web sitenize geldiğinde <br/><span className="text-teal-400">ilk 30 saniyede</span> ne arar?
          </h1>
          <p className="text-slate-300 text-2xl max-w-[800px] leading-relaxed">
            Güven, net bilgi ve hızlı yönlendirme. İlk temas anı, dönüşümün en kritik noktasıdır.
          </p>
        </div>

        {/* Main Content */}
        <div className="z-10 flex-1 mt-20 relative flex justify-center">
          {/* Mockup */}
          <div className="w-[800px] h-[600px] bg-white rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.1)] border-t border-l border-r border-slate-200 relative">
            <div className="h-16 border-b border-slate-100 flex items-center px-8 justify-between">
              <div className="w-32 h-6 bg-slate-200 rounded"></div>
              <div className="flex gap-6">
                <div className="w-16 h-4 bg-slate-100 rounded"></div>
                <div className="w-16 h-4 bg-slate-100 rounded"></div>
                <div className="w-16 h-4 bg-slate-100 rounded"></div>
              </div>
            </div>
            <div className="p-12 relative">
              <div className="w-3/4 h-16 bg-slate-100 rounded-xl mb-6"></div>
              <div className="w-1/2 h-8 bg-slate-50 rounded-lg mb-12"></div>
              <div className="flex gap-6">
                <div className="w-48 h-64 bg-slate-50 rounded-2xl border border-slate-100"></div>
                <div className="w-48 h-64 bg-slate-50 rounded-2xl border border-slate-100"></div>
                <div className="w-48 h-64 bg-slate-50 rounded-2xl border border-slate-100"></div>
              </div>
            </div>

            {/* Callouts */}
            <div className="absolute top-24 left-10 bg-white border border-teal-200 shadow-xl rounded-2xl p-4 flex items-center gap-4 -translate-x-1/2 animate-pulse">
              <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                <Search className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-800 text-lg">Hangi tedaviler var?</span>
            </div>

            <div className="absolute top-48 right-12 bg-white border border-blue-200 shadow-xl rounded-2xl p-4 flex items-center gap-4 translate-x-1/4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-800 text-lg">Fiyat / ön bilgi alabilir miyim?</span>
            </div>

            <div className="absolute bottom-24 left-24 bg-white border border-indigo-200 shadow-xl rounded-2xl p-4 flex items-center gap-4 -translate-x-1/3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-800 text-lg">Nasıl randevu alırım?</span>
            </div>
            
            <div className="absolute bottom-32 right-32 bg-white border border-amber-200 shadow-xl rounded-2xl p-4 flex items-center gap-4 translate-x-1/4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-800 text-lg">Klinik güvenilir mi?</span>
            </div>

            {/* Mini Chatbot */}
            <div className="absolute -right-8 -bottom-8 w-80 bg-white shadow-2xl border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-[#0f172a] p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div className="text-white font-bold text-lg">ClinicBridge AI</div>
              </div>
              <div className="p-6 bg-slate-50">
                <div className="bg-white p-4 rounded-2xl rounded-tl-sm text-slate-800 shadow-sm border border-slate-100 text-lg">
                  Merhaba, size nasıl yardımcı olabilirim? 
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* POST 3: WhatsApp Yönlendirme */}
      <div id="post-3" className="w-[1200px] h-[1200px] bg-[#0f172a] relative overflow-hidden flex flex-col justify-between p-16">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#14b8a6 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>
        
        {/* Header */}
        <div className="z-10 mt-8 text-center flex flex-col items-center">
          <div className="flex items-center gap-3 mb-6">
            <Bot className="w-8 h-8 text-teal-400" />
            <span className="text-white text-2xl font-bold tracking-tight">ClinicBridge AI</span>
          </div>
          <h1 className="text-white text-5xl font-bold leading-tight max-w-[1000px] mb-4">
            WhatsApp’a yönlendirmek yeterli mi?
          </h1>
          <h2 className="text-teal-400 text-4xl font-semibold mb-6">Yoksa önce doğru ön bilgilendirme mi gerekir?</h2>
          <p className="text-slate-400 text-xl max-w-[800px] leading-relaxed">
            Her ziyaretçiyi aynı kanala göndermek yerine, önce ihtiyacı anlayan bir akış kurmak daha yüksek dönüşüm sağlar.
          </p>
        </div>

        {/* Main Content */}
        <div className="z-10 flex-1 flex justify-center items-center mt-12 gap-12">
          
          {/* Left Flow - Classic */}
          <div className="w-[400px] bg-slate-800/50 backdrop-blur-md rounded-3xl p-8 border border-slate-700 flex flex-col items-center">
            <div className="text-slate-400 font-bold text-xl mb-12 uppercase tracking-wider">Sadece Yönlendirme</div>
            
            <div className="w-full bg-slate-800 rounded-2xl p-6 flex items-center justify-center gap-4 border border-slate-700">
              <Layout className="w-8 h-8 text-slate-400" />
              <span className="text-white text-2xl font-medium">Web Sitesi</span>
            </div>
            
            <div className="w-1 h-16 bg-slate-700 my-2"></div>
            <ArrowRight className="w-8 h-8 text-slate-600 rotate-90" />
            <div className="w-1 h-16 bg-slate-700 my-2"></div>

            <div className="w-full bg-slate-800 rounded-2xl p-6 flex items-center justify-center gap-4 border border-slate-700 opacity-60">
              <MessageSquare className="w-8 h-8 text-green-500" />
              <span className="text-white text-2xl font-medium">WhatsApp</span>
            </div>

            <div className="mt-12 text-center text-slate-400 text-lg">
              <p>Ön eleme yok</p>
              <p>Hazırlıksız ziyaretçi</p>
              <p>Düşük dönüşüm oranı</p>
            </div>
          </div>

          <div className="text-slate-600 font-bold text-4xl">VS</div>

          {/* Right Flow - AI */}
          <div className="w-[500px] bg-gradient-to-b from-teal-900/40 to-slate-800/80 backdrop-blur-md rounded-3xl p-8 border border-teal-500/30 flex flex-col items-center relative shadow-[0_0_80px_rgba(20,184,166,0.15)]">
            <div className="absolute -top-5 bg-teal-500 text-white px-6 py-2 rounded-full font-bold text-lg shadow-lg">
              Akıllı Ön Bilgilendirme
            </div>
            <div className="text-teal-400 font-bold text-xl mb-12 uppercase tracking-wider mt-4">ClinicBridge AI Akışı</div>
            
            <div className="w-full bg-slate-800 rounded-2xl p-6 flex items-center justify-center gap-4 border border-slate-700">
              <Layout className="w-8 h-8 text-white" />
              <span className="text-white text-2xl font-medium">Web Sitesi</span>
            </div>

            <div className="w-1 h-8 bg-teal-500/50 my-1"></div>
            
            {/* Chatbot Mockup in Flow */}
            <div className="w-[110%] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 relative z-10">
              <div className="bg-teal-500 p-4 flex items-center gap-3">
                <Bot className="w-6 h-6 text-white" />
                <span className="text-white font-bold text-lg">AI Ön Bilgilendirme</span>
              </div>
              <div className="p-6 bg-slate-50 flex flex-col gap-4">
                <div className="bg-white p-3 rounded-2xl rounded-tl-sm text-slate-700 shadow-sm border border-slate-100 text-base">
                  Hangi tedaviyle ilgileniyorsunuz?
                </div>
                <div className="bg-teal-500 text-white p-3 rounded-2xl rounded-tr-sm text-base shadow-sm self-end">
                  İmplant hakkında bilgi almak istiyorum.
                </div>
                <div className="bg-white p-3 rounded-2xl rounded-tl-sm text-slate-700 shadow-sm border border-slate-100 text-base">
                  Harika, size sürecimizi kısaca anlatayım... İsterseniz sizi hemen uzmanımıza aktarabilirim.
                </div>
              </div>
            </div>

            <div className="w-1 h-8 bg-teal-500/50 my-1"></div>

            <div className="w-full bg-teal-500/20 rounded-2xl p-6 flex items-center justify-center gap-4 border border-teal-500/50">
              <Calendar className="w-8 h-8 text-teal-400" />
              <span className="text-white text-2xl font-medium">Nitelikli Randevu / İletişim</span>
            </div>

          </div>

        </div>

        {/* Bottom Bar */}
        <div className="z-10 flex justify-center items-center border-t border-slate-800 pt-8 mt-4">
          <div className="text-slate-500 font-medium text-xl">clinicbridge.ai</div>
        </div>
      </div>

      {/* POST 4: Ekip Yükü Azaltma */}
      <div id="post-4" className="w-[1200px] h-[1200px] bg-slate-50 relative overflow-hidden flex flex-col justify-between p-16">
        
        {/* Header */}
        <div className="z-10 mt-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <span className="text-slate-800 text-3xl font-bold tracking-tight">ClinicBridge <span className="text-teal-500">AI</span></span>
          </div>
          <h1 className="text-slate-900 text-6xl font-bold leading-tight max-w-[1000px] mb-6">
            AI destekli hasta iletişimi <span className="text-teal-600">klinik ekiplerinin</span> yükünü nasıl azaltır?
          </h1>
          <p className="text-slate-600 text-2xl max-w-[900px] leading-relaxed">
            Tekrarlayan soruları azaltın, ilk temas sürecini hızlandırın, ekibinizi daha verimli çalıştırın.
          </p>
        </div>

        {/* Main Content */}
        <div className="z-10 flex-1 flex mt-16 gap-10">
          
          {/* Left: Chaos / Incoming requests */}
          <div className="w-[35%] flex flex-col gap-4">
            <div className="text-slate-800 font-bold text-2xl mb-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-slate-400" />
              Gelen Talepler
            </div>
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 w-40 bg-slate-100 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Middle: AI Filter */}
          <div className="w-[30%] flex flex-col items-center justify-center relative">
            <div className="absolute inset-0 bg-teal-500/5 rounded-full blur-[80px]"></div>
            <div className="bg-teal-600 w-32 h-32 rounded-3xl flex items-center justify-center shadow-2xl shadow-teal-500/40 z-10 relative rotate-3 hover:rotate-0 transition-transform">
              <Bot className="w-16 h-16 text-white" />
              <div className="absolute -right-4 -top-4 bg-amber-400 text-slate-900 text-sm font-bold px-3 py-1 rounded-full shadow-md">
                Filtreliyor
              </div>
            </div>
            <div className="mt-10 flex flex-col gap-4 w-full px-4 relative z-10">
              <div className="bg-white border-l-4 border-teal-500 p-4 rounded-r-xl shadow-md font-semibold text-slate-700 text-lg flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-teal-500" />
                Sık sorulara anında yanıt
              </div>
              <div className="bg-white border-l-4 border-blue-500 p-4 rounded-r-xl shadow-md font-semibold text-slate-700 text-lg flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-blue-500" />
                İlk bilgilendirme otomasyonu
              </div>
              <div className="bg-white border-l-4 border-indigo-500 p-4 rounded-r-xl shadow-md font-semibold text-slate-700 text-lg flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-indigo-500" />
                Randevu ön eleme
              </div>
            </div>
          </div>

          {/* Right: Team Dashboard */}
          <div className="w-[35%] flex flex-col gap-4">
            <div className="text-slate-800 font-bold text-2xl mb-4 flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-teal-600" />
              Rahatlayan Ekip Paneli
            </div>
            <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-slate-800 h-16 flex items-center px-6">
                <div className="text-white font-bold text-lg">Yönetim Paneli</div>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-6 bg-slate-50">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="text-slate-400 text-sm font-medium mb-1">Cevaplanan Soru</div>
                    <div className="text-3xl font-bold text-slate-800">142</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="text-slate-400 text-sm font-medium mb-1">Nitelikli Randevu</div>
                    <div className="text-3xl font-bold text-teal-600">28</div>
                  </div>
                </div>
                {/* Clean list */}
                <div className="flex-1 bg-white rounded-xl border border-slate-100 p-4">
                  <div className="text-slate-600 font-semibold mb-4 border-b pb-2">İşlem Bekleyenler (Filtrelenmiş)</div>
                  <div className="flex flex-col gap-3">
                    <div className="h-12 bg-teal-50 rounded-lg flex items-center px-4 border border-teal-100">
                      <div className="w-3 h-3 rounded-full bg-teal-500 mr-3"></div>
                      <div className="h-3 w-32 bg-teal-200 rounded"></div>
                    </div>
                    <div className="h-12 bg-teal-50 rounded-lg flex items-center px-4 border border-teal-100">
                      <div className="w-3 h-3 rounded-full bg-teal-500 mr-3"></div>
                      <div className="h-3 w-24 bg-teal-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* POST 5: 5 Dijital Temas Noktası */}
      <div id="post-5" className="w-[1200px] h-[1200px] bg-[#0f172a] relative overflow-hidden flex flex-col justify-between p-16">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4"></div>

        {/* Header */}
        <div className="z-10 mt-8 text-center flex flex-col items-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <span className="text-white text-3xl font-bold tracking-tight">ClinicBridge AI</span>
          </div>
          <h1 className="text-white text-5xl font-bold leading-tight max-w-[1000px] mb-6">
            Kliniklerde randevu dönüşüm oranını artıran <br/><span className="text-teal-400">5 dijital temas noktası</span>
          </h1>
          <p className="text-slate-300 text-2xl max-w-[800px] leading-relaxed">
            Doğru dijital temas noktaları, ziyaretçiyi yalnızca bilgilendirmez; onu aksiyona taşır.
          </p>
        </div>

        {/* Main Content - 5 Steps */}
        <div className="z-10 flex-1 flex flex-col justify-center mt-12 w-full max-w-[1000px] mx-auto relative">
          
          <div className="absolute left-8 top-12 bottom-12 w-1 bg-gradient-to-b from-teal-500/20 via-teal-500 to-teal-500/20"></div>

          <div className="flex flex-col gap-8">
            {/* Step 1 */}
            <div className="flex items-center gap-8 relative">
              <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-white font-bold text-2xl z-10 relative">
                1
              </div>
              <div className="flex-1 bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 flex items-center gap-6 shadow-xl hover:border-teal-500/50 transition-colors">
                <div className="w-14 h-14 rounded-xl bg-slate-700 flex items-center justify-center text-teal-400">
                  <Layout className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-2xl mb-2">Web sitesi ilk karşılama</h3>
                  <p className="text-slate-400 text-lg">Ziyaretçiyi 30 saniye içinde güven ve doğru tasarımla karşılamak.</p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-8 relative">
              <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-teal-500 flex items-center justify-center text-white font-bold text-2xl z-10 relative shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                2
              </div>
              <div className="flex-1 bg-gradient-to-r from-teal-900/40 to-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-teal-500/30 flex items-center gap-6 shadow-xl">
                <div className="w-14 h-14 rounded-xl bg-teal-500 flex items-center justify-center text-white">
                  <Bot className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-2xl mb-2">Akıllı soru-cevap / Chatbot</h3>
                  <p className="text-slate-300 text-lg">Ziyaretçinin sorularına 7/24 anında ve doğru dilde yanıt vermek.</p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-8 relative">
              <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-white font-bold text-2xl z-10 relative">
                3
              </div>
              <div className="flex-1 bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 flex items-center gap-6 shadow-xl">
                <div className="w-14 h-14 rounded-xl bg-slate-700 flex items-center justify-center text-blue-400">
                  <Search className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-2xl mb-2">Hızlı ön bilgilendirme</h3>
                  <p className="text-slate-400 text-lg">Fiyat, süreç ve uzmanlar hakkında özet bilgiyi anında sağlamak.</p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-center gap-8 relative">
              <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center text-white font-bold text-2xl z-10 relative">
                4
              </div>
              <div className="flex-1 bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 flex items-center gap-6 shadow-xl">
                <div className="w-14 h-14 rounded-xl bg-slate-700 flex items-center justify-center text-indigo-400">
                  <ArrowRight className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-2xl mb-2">Doğru iletişim kanalına yönlendirme</h3>
                  <p className="text-slate-400 text-lg">Ziyaretçinin niyetine göre WhatsApp veya çağrı merkezine aktarım.</p>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex items-center gap-8 relative">
              <div className="w-16 h-16 rounded-full bg-slate-800 border-4 border-teal-500 flex items-center justify-center text-white font-bold text-2xl z-10 relative shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                5
              </div>
              <div className="flex-1 bg-gradient-to-r from-teal-900/40 to-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-teal-500/30 flex items-center gap-6 shadow-xl">
                <div className="w-14 h-14 rounded-xl bg-teal-500 flex items-center justify-center text-white">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-2xl mb-2">Randevu / Demo talep aksiyonu</h3>
                  <p className="text-slate-300 text-lg">Isınan hastayı doğrudan nitelikli bir randevuya dönüştürmek.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
