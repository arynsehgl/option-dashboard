/**
 * PhonePe Payment Gateway Integration
 * 
 * This file contains utilities for integrating PhonePe payment gateway.
 * You'll need to implement the actual API calls based on PhonePe's documentation.
 * 
 * PhonePe Documentation: https://developer.phonepe.com/
 */

// PhonePe Configuration
const PHONEPE_CONFIG = {
  merchantId: import.meta.env.VITE_PHONEPE_MERCHANT_ID,
  saltKey: import.meta.env.VITE_PHONEPE_SALT_KEY,
  saltIndex: import.meta.env.VITE_PHONEPE_SALT_INDEX || 1,
  // Use sandbox URL for testing, production URL for live
  baseUrl: import.meta.env.VITE_PHONEPE_ENV === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox'
}

/**
 * Generate X-VERIFY header for PhonePe API requests
 * This is a SHA256 hash of (base64(payload) + /pg/v1/pay + saltKey) + ### + saltIndex
 */
function generateXVerify(payload, endpoint) {
  // TODO: Implement X-VERIFY generation
  // Refer to PhonePe documentation for exact implementation
  // This typically involves:
  // 1. Base64 encode the payload
  // 2. Concatenate with endpoint path
  // 3. Add salt key
  // 4. Generate SHA256 hash
  // 5. Append ### and saltIndex
  
  console.warn('X-VERIFY generation not implemented. Please implement based on PhonePe docs.')
  return ''
}

/**
 * Create a payment request
 * @param {Object} paymentData - Payment details
 * @param {string} paymentData.amount - Amount in paise (e.g., 99900 for ₹999)
 * @param {string} paymentData.userId - User ID
 * @param {string} paymentData.planId - Subscription plan ID
 * @param {string} paymentData.redirectUrl - Callback URL after payment
 * @returns {Promise<Object>} Payment response
 */
export async function createPayment(paymentData) {
  try {
    const { amount, userId, planId, redirectUrl } = paymentData

    // Construct payment request payload
    const payload = {
      merchantId: PHONEPE_CONFIG.merchantId,
      merchantTransactionId: `TXN_${Date.now()}_${userId}`, // Unique transaction ID
      merchantUserId: userId,
      amount: amount, // Amount in paise
      redirectUrl: redirectUrl || `${window.location.origin}/payment/callback`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${window.location.origin}/api/payment/callback`, // Webhook URL
      mobileNumber: '', // Optional
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    }

    // Base64 encode payload
    const base64Payload = btoa(JSON.stringify(payload))

    // Generate X-VERIFY header
    const xVerify = generateXVerify(base64Payload, '/pg/v1/pay')

    // Make API request to PhonePe
    const response = await fetch(`${PHONEPE_CONFIG.baseUrl}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        request: base64Payload
      })
    })

    const data = await response.json()

    if (data.success) {
      return {
        success: true,
        redirectUrl: data.data.instrumentResponse.redirectInfo.url,
        transactionId: payload.merchantTransactionId
      }
    } else {
      throw new Error(data.message || 'Payment initiation failed')
    }
  } catch (error) {
    console.error('PhonePe payment error:', error)
    throw error
  }
}

/**
 * Check payment status
 * @param {string} transactionId - Merchant transaction ID
 * @returns {Promise<Object>} Payment status
 */
export async function checkPaymentStatus(transactionId) {
  try {
    // TODO: Implement payment status check
    // PhonePe provides an API to check transaction status
    // This is typically: GET /pg/v1/status/{merchantId}/{transactionId}
    
    const endpoint = `/pg/v1/status/${PHONEPE_CONFIG.merchantId}/${transactionId}`
    const xVerify = generateXVerify('', endpoint)

    const response = await fetch(`${PHONEPE_CONFIG.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
        'X-MERCHANT-ID': PHONEPE_CONFIG.merchantId,
        'Accept': 'application/json'
      }
    })

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Payment status check error:', error)
    throw error
  }
}

/**
 * Verify payment callback/webhook
 * @param {Object} callbackData - Data from PhonePe callback
 * @returns {boolean} Whether payment is verified
 */
export function verifyPaymentCallback(callbackData) {
  try {
    // TODO: Implement payment verification
    // PhonePe sends a callback with payment details
    // You need to verify the X-VERIFY header matches the expected hash
    // This prevents tampering with payment responses
    
    // Steps:
    // 1. Extract X-VERIFY header from callback
    // 2. Generate expected hash using same method as X-VERIFY generation
    // 3. Compare hashes
    // 4. Verify transaction status
    
    console.warn('Payment verification not implemented. Please implement based on PhonePe docs.')
    return false
  } catch (error) {
    console.error('Payment verification error:', error)
    return false
  }
}

/**
 * Get plan amount in paise
 * @param {string} planId - Plan ID (monthly, yearly)
 * @returns {number} Amount in paise
 */
export function getPlanAmount(planId) {
  const plans = {
    monthly: 29900,    // ₹299
    yearly: 300000     // ₹3,000
  }
  return plans[planId] || 0
}

/**
 * Format amount for display
 * @param {number} amountInPaise - Amount in paise
 * @returns {string} Formatted amount (e.g., "₹999")
 */
export function formatAmount(amountInPaise) {
  return `₹${(amountInPaise / 100).toFixed(0)}`
}
