import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Calendar, Layout, Search, Users, UserPlus, CheckCircle, Smartphone, Activity, ArrowRightCircle, ChevronRight, X, Send, Menu, Phone, Globe } from 'lucide-react';

export default function SocialPostsPage() {
  return (
    <div className="bg-slate-100 min-h-screen p-10 flex flex-col items-center gap-16 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi - Light Premium SaaS Style */}
      <div id="post-1" className="w-[1200px] h-[1200px] shrink-0 bg-[#F8FAFC] relative overflow-hidden flex border border-slate-200 shadow-sm">
        
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40"></div>
        <div className="absolute -top-[400px] -right-[200px] w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        {/* LEFT COLUMN: Content */}
        <div className="w-[55%] h-full z-10 flex flex-col justify-center pl-20 pr-10">
          
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-teal-400" />
            </div>
            <span className="text-slate-900 text-[20px] font-bold tracking-tight">ClinicBridge <span className="text-teal-600">AI</span></span>
          </div>

          {/* Heading */}
          <h1 className="text-slate-900 text-[64px] font-extrabold leading-[1.1] mb-8 tracking-tight">
            Klinik web siteleri neden <br/>
            sadece <span className="text-teal-600 relative">broşür gibi
              <svg className="absolute w-full h-3 -bottom-1 left-0 text-teal-200" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="4" fill="transparent"/></svg>
            </span> kalmamalı?
          </h1>

          {/* Description */}
          <p className="text-slate-500 text-[24px] leading-[1.6] mb-12 font-medium max-w-[500px]">
            Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, doğru yönlendirmeli ve aktif bir dönüşüm kanalına evrilmeli.
          </p>

          {/* Feature List */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm w-fit">
              <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-teal-600" />
              </div>
              <span className="text-slate-700 font-bold text-lg">7/24 Anında Yanıt</span>
            </div>
            <div className="flex items-center gap-4 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm w-fit">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <ArrowRightCircle className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-slate-700 font-bold text-lg">Tedaviye Özel Yönlendirme</span>
            </div>
            <div className="flex items-center gap-4 bg-white px-5 py-4 rounded-xl border border-slate-200 shadow-sm w-fit">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-slate-700 font-bold text-lg">Nitelikli Randevu Kazanımı</span>
            </div>
          </div>

        </div>


        {/* RIGHT COLUMN: Product Mockup */}
        <div className="w-[45%] h-full z-10 relative flex items-center">
          
          {/* Floating Browser Window Mockup */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[700px] h-[750px] bg-white rounded-l-2xl border border-slate-200 border-r-0 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden">
            
            {/* Browser Header */}
            <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-3 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
              </div>
              <div className="flex-1 bg-white border border-slate-200 h-7 rounded-md flex items-center justify-center">
                <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5"><Globe className="w-3 h-3"/> www.sizin-klinik.com</span>
              </div>
            </div>

            {/* Wireframe Website Content */}
            <div className="flex-1 p-8 flex flex-col gap-6 relative">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="w-32 h-8 bg-slate-100 rounded-lg"></div>
                <div className="flex gap-4">
                  <div className="w-16 h-2 bg-slate-100 rounded-full"></div>
                  <div className="w-16 h-2 bg-slate-100 rounded-full"></div>
                  <div className="w-20 h-2 bg-slate-100 rounded-full"></div>
                </div>
              </div>
              <div className="w-full h-64 bg-slate-50 rounded-xl border border-slate-100"></div>
              <div className="flex gap-4">
                <div className="flex-1 h-32 bg-slate-50 rounded-xl border border-slate-100"></div>
                <div className="flex-1 h-32 bg-slate-50 rounded-xl border border-slate-100"></div>
              </div>

              {/* ClinicBridge AI Widget - Highly Realistic */}
              <div className="absolute right-8 bottom-8 w-[380px] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-200 overflow-hidden flex flex-col z-30">
                
                {/* Widget Header */}
                <div className="bg-slate-900 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-base leading-tight">Clinic Asistanı</h3>
                      <p className="text-slate-400 text-xs flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span>
                        Çevrimiçi
                      </p>
                    </div>
                  </div>
                  <X className="w-5 h-5 text-slate-400" />
                </div>

                {/* Chat Body */}
                <div className="p-5 bg-slate-50 flex flex-col gap-4 h-[320px]">
                  
                  {/* AI Message */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0 shadow-sm border border-teal-200">
                      <Bot className="w-4 h-4 text-teal-700" />
                    </div>
                    <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm text-slate-700 text-[14px] shadow-sm leading-relaxed">
                      Merhaba! Kliniğimize hoş geldiniz. Randevu almak veya tedaviler hakkında bilgi almak ister misiniz?
                    </div>
                  </div>

                  {/* Patient Message */}
                  <div className="flex gap-3 self-end max-w-[85%]">
                    <div className="bg-teal-600 px-4 py-3 rounded-2xl rounded-tr-sm text-white text-[14px] shadow-sm leading-relaxed">
                      İmplant tedavisi fiyatları nedir?
                    </div>
                  </div>

                  {/* AI Response with Actions */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0 shadow-sm border border-teal-200">
                      <Bot className="w-4 h-4 text-teal-700" />
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm text-slate-700 text-[14px] shadow-sm leading-relaxed">
                        İmplant tedavisi kişinin çene yapısına göre planlanır. Dilerseniz size ücretsiz bir ön muayene planlayabilirim.
                      </div>
                      
                      {/* Action Cards inside Chat */}
                      <div className="flex flex-col gap-2 w-[240px]">
                        <div className="bg-white border border-teal-200 hover:border-teal-400 text-teal-700 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center justify-between cursor-pointer">
                          Hemen Randevu Al <ChevronRight className="w-4 h-4"/>
                        </div>
                        <div className="bg-white border border-slate-200 hover:border-slate-300 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm flex items-center justify-between cursor-pointer">
                          Fiyat Listesi İstiyorum <ChevronRight className="w-4 h-4"/>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full h-11 px-4 flex items-center text-slate-400 text-sm border border-slate-200/60">
                    Mesajınızı yazın...
                  </div>
                  <div className="w-11 h-11 bg-teal-600 rounded-full flex items-center justify-center shrink-0 shadow-md">
                    <Send className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>

      </div>

      {/* POST 2 (Hidden for now) */}
      <div id="post-2" className="hidden"></div>
      <div id="post-3" className="hidden"></div>
      <div id="post-4" className="hidden"></div>
      <div id="post-5" className="hidden"></div>

    </div>
  );
}
