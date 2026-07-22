import { getAdminDb } from '../../firebase-admin';
import { AppointmentActionToken } from '../../types/notification';
import crypto from 'crypto';

export class TokenService {
  /**
   * Generates a random, secure token string
   */
  private generateTokenString(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Creates and stores an action token for an appointment
   */
  public async createActionToken(
    clinic_id: string,
    appointment_id: string,
    patient_id: string,
    action_type: AppointmentActionToken['action_type'],
    expiresInHours: number = 48
  ): Promise<string | null> {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn('[TokenService] adminDb is not available');
      return null;
    }

    const tokenString = this.generateTokenString();
    const expires_at = new Date();
    expires_at.setHours(expires_at.getHours() + expiresInHours);

    const tokenDoc: AppointmentActionToken = {
      token: tokenString,
      appointment_id,
      clinic_id,
      patient_id,
      action_type,
      expires_at,
      used: false,
      created_at: new Date(),
    };

    try {
      const docRef = adminDb.collection('appointment_action_tokens').doc();
      tokenDoc.id = docRef.id;
      await docRef.set(tokenDoc);
      return tokenString;
    } catch (err) {
      console.error('[TokenService] Failed to create token', err);
      return null;
    }
  }

  /**
   * Validates a token and marks it as used if valid
   */
  public async validateAndConsumeToken(
    tokenString: string,
    expectedAction?: AppointmentActionToken['action_type']
  ): Promise<{ valid: boolean; data?: AppointmentActionToken; error?: string }> {
    const adminDb = getAdminDb();
    if (!adminDb) return { valid: false, error: 'Database unavailable' };

    try {
      const snapshot = await adminDb
        .collection('appointment_action_tokens')
        .where('token', '==', tokenString)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return { valid: false, error: 'Token not found' };
      }

      const docRef = snapshot.docs[0];
      const tokenData = docRef.data() as AppointmentActionToken;
      tokenData.id = docRef.id;

      if (tokenData.used) {
        return { valid: false, error: 'Token has already been used' };
      }

      if (tokenData.expires_at.getTime() < new Date().getTime()) {
        return { valid: false, error: 'Token has expired' };
      }

      if (expectedAction && tokenData.action_type !== expectedAction) {
        return { valid: false, error: 'Invalid action type for this token' };
      }

      // Consume the token
      await docRef.ref.update({
        used: true,
        used_at: new Date(),
      });

      return { valid: true, data: tokenData };
    } catch (err: any) {
      console.error('[TokenService] Token validation failed', err);
      return { valid: false, error: err.message };
    }
  }
}

export const tokenService = new TokenService();
