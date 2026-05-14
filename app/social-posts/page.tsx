import React from 'react';
import { Bot, MessageSquare, Clock, ShieldCheck, ArrowRight, Calendar, Layout, Search, Users, UserPlus, CheckCircle, Smartphone, Activity, ArrowRightCircle, ChevronRight, X, Send, Menu, Phone, Globe, Sparkles } from 'lucide-react';

export default function SocialPostsPage() {
  return (
    <div className="bg-slate-200 min-h-screen p-10 flex flex-col items-center gap-16 font-sans">
      
      {/* POST 1: Broşür Olmayan Web Sitesi - EXACT TOP-DOWN PRODUCT STYLE */}
      <div id="post-1" className="w-[1200px] h-[1200px] shrink-0 bg-white relative flex flex-col items-center pt-[100px] rounded-3xl overflow-hidden shadow-2xl">
        
        {/* TOP: Header & Subtitle */}
        <div className="flex flex-col items-center text-center px-20 z-10 w-full max-w-[1000px]">
          <h1 className="text-[#0f172a] text-[52px] font-[800] leading-[1.15] tracking-[-1px] mb-6">
            Klinik web siteleri neden sadece <br/> broşür gibi kalmamalı?
          </h1>
          <p className="text-[#475569] text-[24px] font-[500] leading-[1.5] max-w-[850px]">
            Web siteniz yalnızca bilgi sunmamalı; hastayı karşılamalı, doğru yönlendirmeli ve <span className="font-[700] text-[#0f172a]">aktif bir dönüşüm kanalına</span> evrilmeli.
          </p>
        </div>

        {/* BOTTOM: Realistic Product UI Mockups */}
        <div className="mt-[80px] w-full flex-1 relative flex justify-center items-start">
          
          {/* Main Website Mockup */}
          <div className="w-[960px] h-[700px] bg-[#f8fafc] rounded-t-[24px] border border-[#e2e8f0] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] flex flex-col relative overflow-hidden">
            
            {/* Browser Header */}
            <div className="h-[60px] bg-white border-b border-[#e2e8f0] flex items-center px-[24px] gap-[16px] shrink-0">
              <div className="flex gap-[8px]">
                <div className="w-[12px] h-[12px] rounded-full bg-[#e2e8f0]"></div>
                <div className="w-[12px] h-[12px] rounded-full bg-[#e2e8f0]"></div>
                <div className="w-[12px] h-[12px] rounded-full bg-[#e2e8f0]"></div>
              </div>
              <div className="flex-1 max-w-[400px] bg-[#f1f5f9] h-[32px] rounded-[6px] flex items-center px-[16px]">
                <span className="text-[#94a3b8] text-[13px] font-[500] flex items-center gap-[6px]">
                  <Globe className="w-[14px] h-[14px]"/> novadental.com
                </span>
              </div>
            </div>

            {/* Faint Website Content Background */}
            <div className="flex-1 p-[40px] flex flex-col gap-[30px] opacity-[0.3]">
              <div className="flex justify-between items-center pb-[20px] border-b border-[#cbd5e1]">
                <div className="w-[160px] h-[24px] bg-[#cbd5e1] rounded-[4px]"></div>
                <div className="flex gap-[24px]">
                  <div className="w-[60px] h-[12px] bg-[#cbd5e1] rounded-full"></div>
                  <div className="w-[60px] h-[12px] bg-[#cbd5e1] rounded-full"></div>
                  <div className="w-[60px] h-[12px] bg-[#cbd5e1] rounded-full"></div>
                </div>
              </div>
              <div className="w-full h-[200px] bg-[#e2e8f0] rounded-[16px]"></div>
              <div className="flex gap-[20px]">
                <div className="flex-1 h-[160px] bg-[#e2e8f0] rounded-[16px]"></div>
                <div className="flex-1 h-[160px] bg-[#e2e8f0] rounded-[16px]"></div>
              </div>
            </div>

            {/* THE AI LAYER (Realistic ClinicBridge Widget) */}
            <div className="absolute right-[40px] bottom-0 w-[420px] h-[580px] bg-white rounded-t-[24px] shadow-[0_0_60px_rgba(0,0,0,0.15)] border border-[#e2e8f0] border-b-0 flex flex-col overflow-hidden z-20">
              
              {/* Widget Header */}
              <div className="bg-[#0f172a] p-[24px] flex items-center justify-between">
                <div className="flex items-center gap-[16px]">
                  <div className="w-[48px] h-[48px] bg-[linear-gradient(135deg,#3b82f6,#1d4ed8)] rounded-full flex items-center justify-center shadow-lg">
                    <Sparkles className="w-[24px] h-[24px] text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-[700] text-[18px] leading-tight">Nova Dental Asistan</h3>
                    <p className="text-white/80 text-[13px] flex items-center gap-[6px] mt-[4px] font-[500]">
                      <span className="w-[8px] h-[8px] bg-[#10b981] rounded-full inline-block"></span>
                      Çevrimiçi
                    </p>
                  </div>
                </div>
                <X className="w-[24px] h-[24px] text-white/60" />
              </div>

              {/* Chat Body */}
              <div className="flex-1 bg-[#f8fafc] p-[24px] flex flex-col gap-[20px] overflow-hidden">
                
                {/* AI Welcome Message */}
                <div className="flex gap-[12px]">
                  <div className="w-[32px] h-[32px] rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <Bot className="w-[16px] h-[16px] text-[#3b82f6]" />
                  </div>
                  <div className="bg-white border border-[#e2e8f0] px-[16px] py-[14px] rounded-[18px] rounded-tl-[4px] text-[#0f172a] text-[15px] shadow-sm leading-[1.5] max-w-[85%] font-[500]">
                    Merhaba, kliniğimize hoş geldiniz! Randevu almak veya tedaviler hakkında bilgi almak ister misiniz?
                  </div>
                </div>

                {/* Patient Question */}
                <div className="flex gap-[12px] self-end max-w-[85%]">
                  <div className="bg-[#3b82f6] px-[16px] py-[14px] rounded-[18px] rounded-tr-[4px] text-white text-[15px] shadow-sm leading-[1.5] font-[500]">
                    İmplant tedavisi ne kadar sürüyor?
                  </div>
                </div>

                {/* AI Response & Action */}
                <div className="flex gap-[12px]">
                  <div className="w-[32px] h-[32px] rounded-full bg-white border border-[#e2e8f0] flex items-center justify-center shrink-0 shadow-sm mt-1">
                    <Bot className="w-[16px] h-[16px] text-[#3b82f6]" />
                  </div>
                  <div className="flex flex-col gap-[12px] max-w-[85%]">
                    <div className="bg-white border border-[#e2e8f0] px-[16px] py-[14px] rounded-[18px] rounded-tl-[4px] text-[#0f172a] text-[15px] shadow-sm leading-[1.5] font-[500]">
                      İmplant tedavisi genellikle 3-6 ay süren iki aşamalı bir süreçtir. Sizin durumunuzu uzman hekimimizle değerlendirmemiz en doğrusu olacaktır.
                      <br/><br/>
                      Dilerseniz hemen ücretsiz bir ön muayene planlayabilirim.
                    </div>
                    
                    {/* Interactive CTA Buttons inside chat */}
                    <div className="flex flex-col gap-[8px]">
                      <div className="bg-white border border-[#3b82f6] text-[#3b82f6] px-[16px] py-[12px] rounded-[12px] text-[14px] font-[700] shadow-sm flex items-center justify-between hover:bg-[#eff6ff] transition-colors cursor-pointer">
                        Hemen Randevu Al <ChevronRight className="w-[16px] h-[16px]"/>
                      </div>
                      <div className="bg-white border border-[#e2e8f0] text-[#475569] px-[16px] py-[12px] rounded-[12px] text-[14px] font-[600] shadow-sm flex items-center justify-between hover:bg-[#f8fafc] transition-colors cursor-pointer">
                        WhatsApp'a Bağlan <ChevronRight className="w-[16px] h-[16px]"/>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Input Area */}
              <div className="p-[20px] border-t border-[#e2e8f0] bg-white flex items-center gap-[12px]">
                <div className="flex-1 bg-[#f1f5f9] rounded-full h-[48px] px-[20px] flex items-center text-[#94a3b8] text-[15px] font-[500]">
                  Mesajınızı yazın...
                </div>
                <div className="w-[48px] h-[48px] bg-[#3b82f6] rounded-full flex items-center justify-center shrink-0 shadow-md">
                  <Send className="w-[20px] h-[20px] text-white ml-[2px]" />
                </div>
              </div>

            </div>

            {/* "ClinicBridge AI Katmanı" floating label to explain the context */}
            <div className="absolute right-[480px] bottom-[200px] z-30">
               <div className="bg-white px-[20px] py-[12px] rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.1)] border border-[#e2e8f0] flex items-center gap-[10px]">
                 <div className="w-[10px] h-[10px] bg-[#10b981] rounded-full animate-pulse"></div>
                 <span className="text-[#0f172a] font-[700] text-[15px]">Aktif Dönüşüm Katmanı</span>
               </div>
               {/* Line pointing to widget */}
               <div className="absolute right-[-40px] top-[24px] w-[40px] border-t-2 border-dashed border-[#cbd5e1]"></div>
            </div>

          </div>

        </div>

        {/* Minimal Footer Logo */}
        <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 flex items-center gap-[8px] opacity-[0.6]">
          <Bot className="w-[20px] h-[20px] text-[#0f172a]" />
          <span className="text-[#0f172a] font-[700] text-[16px] tracking-tight">ClinicBridge AI</span>
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
