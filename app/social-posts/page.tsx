import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Calendar, Layout, Search, Users, UserPlus, CheckCircle, Smartphone, Activity, ArrowRightCircle, ChevronRight, X, Send, Menu, Phone, Globe, Sparkles } from 'lucide-react';

export default function SocialPostsPage() {
  return (
    <div className="bg-slate-100 min-h-screen p-10 flex flex-col items-center gap-16 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi - EXACT TOP-DOWN PRODUCT STYLE */}
      <div id="post-1" className="w-[1200px] h-[1200px] shrink-0 bg-[#f8fafc] relative flex flex-col items-center pt-24 rounded-3xl overflow-hidden shadow-2xl box-border">
        
        {/* TOP: Header & Subtitle */}
        <div className="flex flex-col items-center text-center px-20 z-10 w-full max-w-[1000px] shrink-0">
          <h1 className="text-slate-900 text-6xl font-extrabold leading-tight tracking-tight mb-6">
            Klinik web siteleri neden sadece <br/> broşür gibi kalmamalı?
          </h1>
          <p className="text-slate-600 text-2xl font-medium leading-relaxed max-w-[850px]">
            Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, doğru yönlendirmeli ve <span className="font-bold text-slate-900">aktif bir dönüşüm kanalına</span> evrilmeli.
          </p>
        </div>

        {/* BOTTOM: Realistic Product UI Mockups */}
        <div className="mt-20 w-full flex-1 relative flex justify-center items-start shrink-0">
          
          {/* Main Website Mockup */}
          <div className="w-[960px] h-[700px] bg-white rounded-t-3xl border border-slate-200 shadow-2xl flex flex-col relative overflow-hidden box-border">
            
            {/* Browser Header */}
            <div className="h-16 bg-slate-50 border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 box-border">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
              </div>
              <div className="flex-1 max-w-sm bg-white border border-slate-200 h-8 rounded-md flex items-center px-4 box-border">
                <span className="text-slate-400 text-sm font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4"/> novadental.com
                </span>
              </div>
            </div>

            {/* Faint Website Content Background */}
            <div className="flex-1 p-10 flex flex-col gap-8 opacity-40 box-border pointer-events-none">
              <div className="flex justify-between items-center pb-6 border-b border-slate-200">
                <div className="w-40 h-6 bg-slate-200 rounded-md"></div>
                <div className="flex gap-6">
                  <div className="w-16 h-3 bg-slate-200 rounded-full"></div>
                  <div className="w-16 h-3 bg-slate-200 rounded-full"></div>
                  <div className="w-16 h-3 bg-slate-200 rounded-full"></div>
                </div>
              </div>
              <div className="w-full h-56 bg-slate-100 rounded-2xl"></div>
              <div className="flex gap-6">
                <div className="flex-1 h-40 bg-slate-100 rounded-2xl"></div>
                <div className="flex-1 h-40 bg-slate-100 rounded-2xl"></div>
              </div>
            </div>

            {/* THE AI LAYER (Realistic ClinicBridge Widget) */}
            <div className="absolute right-12 bottom-0 w-[420px] bg-white rounded-t-3xl shadow-[0_0_60px_rgba(0,0,0,0.2)] border border-slate-200 border-b-0 flex flex-col z-20 box-border" style={{ height: '640px' }}>
              
              {/* Widget Header */}
              <div className="bg-slate-900 p-5 flex items-center justify-between shrink-0 box-border">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-lg shrink-0">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <h3 className="text-white font-bold text-lg leading-tight m-0">Nova Dental Asistan</h3>
                    <p className="text-white/80 text-sm flex items-center gap-2 mt-1 font-medium m-0">
                      <span className="w-2 h-2 bg-green-500 rounded-full inline-block shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                      Çevrimiçi
                    </p>
                  </div>
                </div>
                <X className="w-6 h-6 text-slate-400 shrink-0" />
              </div>

              {/* Chat Body */}
              <div className="flex-1 bg-slate-50 p-5 flex flex-col gap-5 overflow-hidden box-border">
                
                {/* AI Welcome Message */}
                <div className="flex gap-3 shrink-0 w-full box-border items-start">
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <Bot className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm text-slate-700 text-[15px] shadow-sm leading-relaxed max-w-[85%] font-medium box-border break-words">
                    Merhaba, kliniğimize hoş geldiniz! Randevu almak veya tedaviler hakkında bilgi almak ister misiniz?
                  </div>
                </div>

                {/* Patient Question */}
                <div className="flex gap-3 self-end max-w-[85%] shrink-0 box-border items-start">
                  <div className="bg-blue-500 px-4 py-3 rounded-2xl rounded-tr-sm text-white text-[15px] shadow-sm leading-relaxed font-medium box-border break-words">
                    İmplant tedavisi ne kadar sürüyor?
                  </div>
                </div>

                {/* AI Response & Action */}
                <div className="flex gap-3 shrink-0 w-full box-border items-start">
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <Bot className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex flex-col gap-3 max-w-[85%] shrink-0 box-border">
                    <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm text-slate-700 text-[15px] shadow-sm leading-relaxed font-medium box-border break-words">
                      İmplant tedavisi genellikle 3-6 ay süren iki aşamalı bir süreçtir. Sizin durumunuzu uzman hekimimizle değerlendirmemiz en doğrusu olacaktır.
                      <br/><br/>
                      Dilerseniz hemen ücretsiz bir ön muayene planlayabilirim.
                    </div>
                    
                    {/* Interactive CTA Buttons inside chat */}
                    <div className="flex flex-col gap-2 shrink-0 box-border w-full">
                      <div className="bg-white border border-blue-500 text-blue-600 px-4 py-3 rounded-xl text-[14px] font-bold shadow-sm flex items-center justify-between box-border">
                        Hemen Randevu Al <ChevronRight className="w-5 h-5 shrink-0"/>
                      </div>
                      <div className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[14px] font-bold shadow-sm flex items-center justify-between box-border">
                        WhatsApp'a Bağlan <ChevronRight className="w-5 h-5 shrink-0"/>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-slate-200 bg-white flex items-center gap-3 shrink-0 box-border">
                <div className="flex-1 bg-slate-100 rounded-full h-12 px-5 flex items-center text-slate-400 text-[15px] font-medium box-border">
                  Mesajınızı yazın...
                </div>
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center shrink-0 shadow-md box-border">
                  <Send className="w-5 h-5 text-white ml-1 shrink-0" />
                </div>
              </div>

            </div>

            {/* "ClinicBridge AI Katmanı" floating label to explain the context */}
            <div className="absolute right-[460px] bottom-[260px] z-30 shrink-0">
               <div className="bg-white px-5 py-3 rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.1)] border border-slate-200 flex items-center gap-3 box-border">
                 <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shrink-0"></div>
                 <span className="text-slate-900 font-bold text-[15px] whitespace-nowrap">Aktif Dönüşüm Katmanı</span>
               </div>
               {/* Line pointing to widget */}
               <div className="absolute right-[-50px] top-[24px] w-[50px] border-t-[3px] border-dashed border-slate-300"></div>
            </div>

          </div>

        </div>

        {/* Minimal Footer Logo */}
        <div className="absolute bottom-[40px] left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-50 shrink-0">
          <Bot className="w-6 h-6 text-slate-900" />
          <span className="text-slate-900 font-bold text-lg tracking-tight">ClinicBridge AI</span>
        </div>

      </div>

      {/* OTHER POSTS (Hidden) */}
      <div id="post-2" className="hidden"></div>
      <div id="post-3" className="hidden"></div>
      <div id="post-4" className="hidden"></div>
      <div id="post-5" className="hidden"></div>

    </div>
  );
}
