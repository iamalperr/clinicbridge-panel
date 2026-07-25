const fs = require('fs');

let currentCode = fs.readFileSync('public/widget.js', 'utf8');

// 1. Add request logging
const requestStartOld = `console.log('[WIDGET_SEND_START]');
      console.log('[WIDGET_CHAT_ENDPOINT]', API_BASE + '/api/public/chat');
      console.log('[WIDGET_REQUEST_STARTED]', {`;

const requestStartNew = `console.log('[WIDGET_SEND_START]');
      
      var isConfirmationSubmit = text.trim().toLowerCase() === 'evet' || text.trim().toLowerCase() === 'yes';
      if (isConfirmationSubmit && pendingApptData) {
         console.log('[APPOINTMENT_CONFIRMATION_REQUEST_STARTED]', {
            traceId: traceId,
            conversationId: sessionId,
            clinicId: clinicId,
            endpoint: API_BASE + '/api/public/chat'
         });
      }

      console.log('[WIDGET_CHAT_ENDPOINT]', API_BASE + '/api/public/chat');
      console.log('[WIDGET_REQUEST_STARTED]', {`;

currentCode = currentCode.replace(requestStartOld, requestStartNew);

// 2. Add response logging and responseType checking
const responseHandlingOldStr = `.then(function (result) {
        var data = result.data;
        console.log('[WIDGET_RESPONSE_BODY]', {
          reply: data.reply,
          appointmentCreated: data.appointmentCreated,
          diagnostics: data.diagnostics,
          success: data.success,
          step_failed: data.step_failed,
          traceId: traceId
        });
        
        var t = shadow.getElementById('cbw-typing'); if (t) t.remove();
        var reply = (data && data.reply) ? data.reply : sys.noReply;
        chatHistory.push({ role: 'assistant', content: reply });
        appendMsg(shadow, reply, false, '', false);
        if (data && data.pendingAppointmentData) pendingApptData = data.pendingAppointmentData;
        if (data && data.appointmentCreated)     pendingApptData = null;

        /* Show contextual actions if any */
        var q = shadow.getElementById('cbw-quick');
        if (q && data && data.suggestedActions && data.suggestedActions.length > 0) {
          q.innerHTML = data.suggestedActions.map(function(sa) {
            return '<button class="cbw-qbtn">' + sa + '</button>';
          }).join('');
          q.style.setProperty('display', 'flex', 'important');
          q.className = 'cbw-contextual'; // Use contextual styling
        }
      })`;

const responseHandlingNewStr = `.then(function (result) {
        var data = result.data;
        
        if (isConfirmationSubmit && pendingApptData) {
          console.log('[APPOINTMENT_CONFIRMATION_RESPONSE]', {
            traceId: traceId,
            status: result.status,
            success: data.success,
            appointmentId: data.appointmentId,
            errorCode: data.errorCode
          });
        }
        
        console.log('[WIDGET_RESPONSE_BODY]', {
          responseType: data.responseType,
          reply: data.reply,
          appointmentCreated: data.appointmentCreated,
          success: data.success,
          traceId: traceId
        });
        
        var t = shadow.getElementById('cbw-typing'); if (t) t.remove();
        var reply = "";

        if (data && data.responseType === "APPOINTMENT_SUBMISSION_SUCCESS") {
           if (data.success === true && typeof data.appointmentId === "string" && data.appointmentId.length > 0 && data.databaseInsertSucceeded === true) {
              reply = data.reply;
              pendingApptData = null;
           } else {
              // This should theoretically never happen if backend is strict, but as per user requirements:
              reply = "Randevu onayı başarısız oldu (Kimlik eksik).";
           }
        } else if (data && data.responseType === "APPOINTMENT_SUBMISSION_FAILED") {
           reply = data.reply || "Üzgünüm, bilgileriniz henüz kliniğe iletilmedi.";
        } else {
           reply = (data && data.reply) ? data.reply : sys.noReply;
           if (data && data.pendingAppointmentData) pendingApptData = data.pendingAppointmentData;
        }

        chatHistory.push({ role: 'assistant', content: reply });
        appendMsg(shadow, reply, false, '', false);

        /* Show contextual actions if any */
        var q = shadow.getElementById('cbw-quick');
        if (q && data && data.suggestedActions && data.suggestedActions.length > 0) {
          q.innerHTML = data.suggestedActions.map(function(sa) {
            return '<button class="cbw-qbtn">' + sa + '</button>';
          }).join('');
          q.style.setProperty('display', 'flex', 'important');
          q.className = 'cbw-contextual'; // Use contextual styling
        }
      })`;

currentCode = currentCode.replace(responseHandlingOldStr, responseHandlingNewStr);

fs.writeFileSync('public/widget.js', currentCode);
console.log("Patched widget.js");
