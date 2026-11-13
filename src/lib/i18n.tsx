import { createContext, useContext, useState, type ReactNode } from 'react';

export type AppLanguage = 'en' | 'hi';

const TRANSLATIONS = {
  en: {
    tagline: 'Scan. Connect. Return.',
    brandMessage: 'Lost things deserve a way back.',
    heroDescription:
      'Register your everyday essentials and generate unique, privacy-first QR recovery tags. Anyone who finds your item can scan the tag with a standard phone camera and message you in the browser—no app download, and no personal phone or email exposed.',
    howItWorks: 'How It Works',
    categories: 'Categories',
    privacy: 'Privacy',
    scanTag: 'Scan Tag',
    ownerSignIn: 'Owner Sign In',
    openDashboard: 'Open Dashboard',
    goToOwnerDashboard: 'Go to Owner Dashboard',
    createFreeAccount: 'Create Free Account',
    scanQrTag: 'Scan QR Tag',
    installApp: 'Install App',
    installOnIOS: 'Install on iPhone',
    installTagbackly: 'Install TAGBACKLY on Your Home Screen',
    iosGuideTitle: 'iPhone / iPad (Safari)',
    iosStep1: '1. Tap the Share button at the bottom or top toolbar in Safari.',
    iosStep2: '2. Scroll down and tap "Add to Home Screen", then tap Add.',
    androidGuideTitle: 'Android / Chrome / Edge',
    androidStep: 'Open the browser menu and tap "Install app" or "Add to Home screen" for standalone access.',
    close: 'Close',
    offlineTitle: 'You are currently offline',
    offlineDesc:
      'Reconnect to load live recovery tags, manage items, or send messages. Private chats and credentials are never cached offline.',
    retryConnection: 'Try Again',
    // Landing Sections
    workflowLabel: 'Workflow',
    workflowHeading: 'Three deliberate steps from lost to returned',
    step1Title: '01. Register your item & generate its unique QR',
    step1Desc:
      'Add a photo, category, custom return note, and optional reward. TAGBACKLY mints an opaque recovery URL and high-contrast QR tag you can download as PNG, print as a sticker sheet, or share.',
    step2Title: '02. Attach the tag to your essentials',
    step2Desc:
      'Slip a recovery card inside your wallet, stick a micro QR label inside a laptop sleeve, or clip a tag onto your keys.',
    step3Title: '03. Finder scans & messages you directly',
    step3Desc:
      'Any phone camera—or our built-in browser QR scanner—opens your item’s public page instantly so finders can chat without creating an account.',
    coverageLabel: 'Coverage',
    coverageHeading: 'Built for everything you carry',
    coverageDesc:
      'Organize every tagged belonging by category, track live states across SAFE, LOST, FOUND, CHATTING, and RETURNED, and tailor your message per item.',
    privacyLabel: 'Privacy Architecture',
    privacyHeading: 'Recover lost items without putting your personal contact details on display',
    privacyDesc:
      'Writing your phone number or home address on a luggage tag invites unwanted contact. TAGBACKLY keeps your email, phone number, and street address strictly private inside your owner profile while routing finder messages through an isolated relay thread.',
    lookupPrompt: 'Found a tagged item?',
    lookupHeading: 'Scan a QR tag or enter its code',
    lookupPlaceholder: 'Enter tag ID (e.g. tb-4f91a2)',
    openTag: 'Open Tag',
    scanCamera: 'Scan Camera',
    // Auth
    backToHome: 'Back to TAGBACKLY',
    loginTitle: 'Sign in to your owner account',
    signupTitle: 'Create your owner account',
    forgotTitle: 'Reset your password',
    loginSub: 'Manage your registered items, QR tags, and finder messages.',
    signupSub: 'Protect your belongings with unique, privacy-first QR recovery tags.',
    forgotRequestSub: 'Enter your registered 10-digit mobile number (+91) to request a 6-digit verification code.',
    forgotConfirmSub: 'Enter the 6-digit verification code and set your new password.',
    fullNameLabel: 'Full Name',
    mobileNumberLabel: 'Mobile Number (+91)',
    mobileNumberPlaceholder: '10-digit mobile number',
    mobileDigitsHint: 'Enter 10 digits (stored securely as +91)',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    confirmPasswordInputLabel: 'Confirm Password',
    newPasswordLabel: 'New Password',
    confirmNewPasswordLabel: 'Confirm New Password',
    passwordsMatchLabel: 'Passwords match',
    passwordsMismatchLabel: 'Passwords do not match',
    smsOtpUnavailableNotice: 'Note: Real Firebase Phone Auth SMS OTP (invisible reCAPTCHA) is not active because Firebase setup was declined. A temporary 6-digit code is issued directly by the server instead.',
    forgotPasswordLink: 'Forgot password?',
    signInBtn: 'Sign In',
    createAccountBtn: 'Create Owner Account',
    sendResetCodeBtn: 'Request Verification Code',
    updatePasswordBtn: 'Update Password',
    // Navigation
    navHome: 'Home',
    navScan: 'Scan',
    navMessages: 'Messages',
    navProfile: 'Profile',
    navItems: 'My Items',
    navQrCodes: 'My QR Codes',
    navNotifications: 'Notifications',
    navSettings: 'Settings',
    navHelp: 'Help & Support',
    signOut: 'Sign Out',
    addNewItem: 'Add New Item',
    // Dashboard & Items
    overviewTitle: 'Welcome back',
    overviewSub: 'Live overview of your registered items, QR tags, and finder conversations.',
    totalItems: 'Total Items',
    lostItems: 'Lost',
    foundItems: 'Found',
    chattingItems: 'Chatting',
    returnedItems: 'Returned',
    activeChats: 'Active Chats',
    myItemsTitle: 'My Registered Items',
    myItemsSub: 'Manage photos, status, custom recovery notes, rewards, and unique QR codes.',
    myQrTitle: 'My QR Codes',
    myQrSub: 'Download, print, share, or preview the unique recovery tag for every registered item.',
    conversationsTitle: 'Finder Conversations',
    conversationsSub: 'Real-time private messages from people who scanned your QR tags.',
    notificationsTitle: 'Notifications',
    notificationsSub: 'Real-time alerts for new finder chats, messages, item status updates, and account activity.',
    profileTitle: 'Profile & Privacy',
    profileSub: 'Control what finders see and keep your personal details strictly private.',
    settingsTitle: 'Settings',
    settingsSub: 'Language preference, alert controls, app installation, and account management.',
    helpTitle: 'Help, Safety & Support',
    helpSub: 'Safe handover guidelines, minor safety advice, and support.',
    // Safety & Trust
    safetyHeadline: 'Safe Item Handover Guidelines',
    safetyPoint1: 'Always meet in a well-lit, busy public location such as a coffee shop, library, transit desk, or local police lobby.',
    safetyPoint2: 'Never share your private home address, personal phone number, or financial details with strangers.',
    safetyPoint3: 'For minors: always involve a parent or trusted guardian during item recovery and any reward arrangements.',
    safetyPoint4: 'No automatic payments are processed by TAGBACKLY. Any optional reward is arranged only after safe return and confirmation.',
    // Settings & Account
    languageLabel: 'Display Language',
    englishLabel: 'English',
    hindiLabel: 'हिन्दी (Hindi)',
    notificationsPrefTitle: 'Browser Alert Notifications',
    notificationsPrefDesc: 'Receive desktop or mobile browser alerts when new finder messages arrive while this tab is minimized.',
    enableAlertsBtn: 'Enable Browser Alerts',
    alertsEnabledLabel: 'Browser alerts enabled',
    alertsBlockedLabel: 'Browser alerts blocked in browser settings',
    alertsUnsupportedLabel: 'Browser notifications unavailable in this browser',
    pwaSectionTitle: 'App Installation & Mobile Readiness',
    pwaSectionDesc: 'Install TAGBACKLY on Android or iPhone Home Screen for fast standalone access.',
    securitySummaryTitle: 'Active Privacy & Security Protections',
    securitySummaryDesc:
      'Unpredictable 12-character hex QR tokens, zero public PII exposure, rate-limited endpoints, duplicate-spam blocking, and strict NetworkOnly caching so private chats and tokens are never stored offline.',
    deleteAccountTitle: 'Delete Account',
    deleteAccountWarn:
      'Permanently delete your account, all registered items, QR tags, uploaded photos, and conversations. This action cannot be undone.',
    deleteAccountBtn: 'Delete My Account',
    confirmPasswordLabel: 'Enter your current password to confirm',
    // Public QR
    noAppNeeded: 'No app download required',
    tagNotFoundTitle: 'Tag Not Found',
    tagNotFoundDesc: 'This QR tag may have been invalid, deactivated, or deleted by its owner.',
    returnHomeBtn: 'Return to TAGBACKLY',
    itemDescriptionLabel: 'Item Description',
    ownerMessageLabel: 'Message from the Owner',
    rewardOfferedLabel: 'Reward Offered',
    contactOwner: 'Contact Owner',
    openConversation: 'Open Owner Conversation',
    reportAbuse: 'Report Abuse',
    blockContact: 'Block Contact',
    sendMessage: 'Send Message',
    finderSessionNotice:
      'Your anonymous finder session is saved on this browser profile so you can return without creating an account. Changing browsers or clearing browser data may reset session recovery.',
    privacyFooterNote:
      'TAGBACKLY protects owner privacy: private phone numbers, email addresses, and home addresses are never exposed on QR pages.',
  },
  hi: {
    tagline: 'स्कैन करें। जुड़ें। लौटाएं।',
    brandMessage: 'खोई हुई चीज़ें घर लौटने की हकदार हैं।',
    heroDescription:
      'अपनी रोज़मर्रा की ज़रूरी चीज़ें पंजीकृत करें और यूनिक, गोपनीयता-सुरक्षित QR रिकवरी टैग बनाएं। जिसे भी आपका सामान मिले, वह सामान्य फ़ोन कैमरे से स्कैन करके ब्राउज़र में ही संदेश भेज सकता है—बिना ऐप डाउनलोड किए और बिना आपका निजी फ़ोन या ईमेल दिखे।',
    howItWorks: 'यह कैसे काम करता है',
    categories: 'श्रेणियाँ',
    privacy: 'गोपनीयता',
    scanTag: 'टैग स्कैन करें',
    ownerSignIn: 'ओनर साइन इन',
    openDashboard: 'डैशबोर्ड खोलें',
    goToOwnerDashboard: 'ओनर डैशबोर्ड खोलें',
    createFreeAccount: 'मुफ़्त अकाउंट बनाएं',
    scanQrTag: 'QR टैग स्कैन करें',
    installApp: 'ऐप इंस्टॉल करें',
    installOnIOS: 'iPhone पर इंस्टॉल करें',
    installTagbackly: 'होम स्क्रीन पर TAGBACKLY जोड़ें',
    iosGuideTitle: 'iPhone / iPad (Safari)',
    iosStep1: '1. Safari टूलबार में Share बटन पर टैप करें।',
    iosStep2: '2. नीचे स्क्रॉल करें और "Add to Home Screen" चुनकर Add पर टैप करें।',
    androidGuideTitle: 'Android / Chrome / Edge',
    androidStep: 'ब्राउज़र मेनू खोलें और स्टैंडअलोन ऐप के लिए "Install app" या "Add to Home screen" चुनें।',
    close: 'बंद करें',
    offlineTitle: 'आप अभी ऑफ़लाइन हैं',
    offlineDesc:
      'लाइव रिकवरी टैग देखने, आइटम अपडेट करने या संदेश भेजने के लिए इंटरनेट से जुड़ें। निजी चैट और लॉगिन डेटा ऑफ़लाइन कैश नहीं किया जाता।',
    retryConnection: 'पुनः प्रयास करें',
    // Landing Sections
    workflowLabel: 'प्रक्रिया',
    workflowHeading: 'खोने से लेकर वापस मिलने तक तीन आसान कदम',
    step1Title: '01. अपना आइटम पंजीकृत करें और यूनिक QR बनाएं',
    step1Desc:
      'फ़ोटो, श्रेणी, कस्टम संदेश और वैकल्पिक इनाम जोड़ें। TAGBACKLY एक सुरक्षित रिकवरी URL और QR टैग बनाता है जिसे आप PNG में डाउनलोड या प्रिंट कर सकते हैं।',
    step2Title: '02. अपनी चीज़ों पर टैग लगाएं',
    step2Desc:
      'अपने वॉलेट में कार्ड रखें, लैपटॉप बैग में स्टिकर लगाएं या चाबियों के साथ टैग जोड़ें।',
    step3Title: '03. फाइंडर स्कैन करके आपसे सीधे चैट करे',
    step3Desc:
      'कोई भी फ़ोन कैमरा—या हमारा इन-ऐप QR स्कैनर—तुरंत पब्लिक पेज खोलता है ताकि फाइंडर बिना अकाउंट बनाए चैट कर सके।',
    coverageLabel: 'श्रेणियाँ',
    coverageHeading: 'आपकी हर ज़रूरी चीज़ के लिए',
    coverageDesc:
      'हर पंजीकृत आइटम को श्रेणी के अनुसार व्यवस्थित करें और SAFE, LOST, FOUND, CHATTING व RETURNED स्थिति ट्रैक करें।',
    privacyLabel: 'गोपनीयता सुरक्षा',
    privacyHeading: 'बिना अपना निजी संपर्क नंबर या पता दिखाए सामान वापस पाएं',
    privacyDesc:
      'टैग पर फ़ोन नंबर या घर का पता लिखना जोखिम भरा होता है। TAGBACKLY आपका ईमेल, फ़ोन और पता पूरी तरह निजी रखता है और फाइंडर से सुरक्षित रिले चैट कराता है।',
    lookupPrompt: 'क्या आपको कोई टैग किया हुआ सामान मिला है?',
    lookupHeading: 'QR टैग स्कैन करें या कोड दर्ज करें',
    lookupPlaceholder: 'टैग ID दर्ज करें (जैसे tb-4f91a2)',
    openTag: 'टैग खोलें',
    scanCamera: 'कैमरा स्कैन',
    // Auth
    backToHome: 'TAGBACKLY पर वापस जाएं',
    loginTitle: 'अपने ओनर अकाउंट में साइन इन करें',
    signupTitle: 'अपना ओनर अकाउंट बनाएं',
    forgotTitle: 'पासवर्ड रीसेट करें',
    loginSub: 'अपने पंजीकृत आइटम, QR टैग और फाइंडर संदेश प्रबंधित करें।',
    signupSub: 'गोपनीयता-सुरक्षित QR रिकवरी टैग के साथ अपनी चीज़ें सुरक्षित करें।',
    forgotRequestSub: '6-अंकों का वेरिफिकेशन कोड पाने के लिए अपना पंजीकृत 10-अंकों का मोबाइल नंबर (+91) दर्ज करें।',
    forgotConfirmSub: '6-अंकों का कोड और नया पासवर्ड दर्ज करें।',
    fullNameLabel: 'पूरा नाम',
    mobileNumberLabel: 'मोबाइल नंबर (+91)',
    mobileNumberPlaceholder: '10-अंकों का मोबाइल नंबर',
    mobileDigitsHint: '10 अंक दर्ज करें (+91 के साथ सुरक्षित रूप से सहेजा जाएगा)',
    emailLabel: 'ईमेल पता',
    passwordLabel: 'पासवर्ड',
    confirmPasswordInputLabel: 'पासवर्ड की पुष्टि करें',
    newPasswordLabel: 'नया पासवर्ड',
    confirmNewPasswordLabel: 'नए पासवर्ड की पुष्टि करें',
    passwordsMatchLabel: 'पासवर्ड मेल खाते हैं',
    passwordsMismatchLabel: 'पासवर्ड मेल नहीं खाते',
    smsOtpUnavailableNotice: 'नोट: Firebase सेटअप अस्वीकार किए जाने के कारण वास्तविक Firebase Phone Auth SMS OTP (इनविज़िबल reCAPTCHA) सक्रिय नहीं है। इसके बजाय सर्वर द्वारा अस्थायी 6-अंकों का कोड जारी किया जाता है।',
    forgotPasswordLink: 'पासवर्ड भूल गए?',
    signInBtn: 'साइन इन करें',
    createAccountBtn: 'ओनर अकाउंट बनाएं',
    sendResetCodeBtn: 'वेरिफिकेशन कोड प्राप्त करें',
    updatePasswordBtn: 'पासवर्ड अपडेट करें',
    // Navigation
    navHome: 'होम',
    navScan: 'स्कैन',
    navMessages: 'संदेश',
    navProfile: 'प्रोफ़ाइल',
    navItems: 'मेरे आइटम',
    navQrCodes: 'मेरे QR कोड',
    navNotifications: 'सूचनाएं',
    navSettings: 'सेटिंग्स',
    navHelp: 'सहायता और सुरक्षा',
    signOut: 'साइन आउट',
    addNewItem: 'नया आइटम जोड़ें',
    // Dashboard & Items
    overviewTitle: 'वापसी पर स्वागत है',
    overviewSub: 'आपके पंजीकृत आइटम, QR टैग और फाइंडर चैट का लाइव विवरण।',
    totalItems: 'कुल आइटम',
    lostItems: 'खोए हुए',
    foundItems: 'मिले हुए',
    chattingItems: 'चैट चालू',
    returnedItems: 'वापस मिले',
    activeChats: 'सक्रिय चैट',
    myItemsTitle: 'मेरे पंजीकृत आइटम',
    myItemsSub: 'फोटो, स्थिति, कस्टम संदेश, इनाम और यूनिक QR कोड प्रबंधित करें।',
    myQrTitle: 'मेरे QR कोड',
    myQrSub: 'हर पंजीकृत आइटम के लिए यूनिक रिकवरी QR डाउनलोड, प्रिंट या शेयर करें।',
    conversationsTitle: 'फाइंडर बातचीत',
    conversationsSub: 'जिन्होंने आपका QR टैग स्कैन किया है, उनसे रीयल-टाइम निजी संदेश।',
    notificationsTitle: 'सूचनाएं',
    notificationsSub: 'नई चैट, नए संदेश, स्थिति अपडेट और अकाउंट गतिविधियों के अलर्ट।',
    profileTitle: 'प्रोफ़ाइल और गोपनीयता',
    profileSub: 'नियंत्रित करें कि फाइंडर को क्या दिखता है और अपनी निजी जानकारी सुरक्षित रखें।',
    settingsTitle: 'सेटिंग्स',
    settingsSub: 'भाषा विकल्प, अलर्ट नियंत्रण, ऐप इंस्टॉलेशन और अकाउंट प्रबंधन।',
    helpTitle: 'सहायता, सुरक्षा और समर्थन',
    helpSub: 'सुरक्षित हैंडओवर दिशानिर्देश, नाबालिग सुरक्षा सलाह और सहायता।',
    // Safety & Trust
    safetyHeadline: 'सुरक्षित आइटम हैंडओवर दिशानिर्देश',
    safetyPoint1: 'हमेशा किसी उजाले और भीड़-भाड़ वाले सार्वजनिक स्थान (जैसे कैफे, लाइब्रेरी या पुलिस डेस्क) पर मिलें।',
    safetyPoint2: 'अजनबियों के साथ कभी भी अपना निजी घर का पता, फोन नंबर या बैंक विवरण साझा न करें।',
    safetyPoint3: 'नाबालिगों के लिए: आइटम वापसी और किसी भी इनाम की व्यवस्था में हमेशा माता-पिता या विश्वसनीय अभिभावक को शामिल करें।',
    safetyPoint4: 'TAGBACKLY कोई स्वचालित भुगतान नहीं लेता। कोई भी इनाम सुरक्षित वापसी और पुष्टि के बाद ही तय किया जाता है।',
    // Settings & Account
    languageLabel: 'भाषा चुनें',
    englishLabel: 'English',
    hindiLabel: 'हिन्दी (Hindi)',
    notificationsPrefTitle: 'ब्राउज़र अलर्ट सूचनाएं',
    notificationsPrefDesc: 'टैब छोटा होने पर भी नए फाइंडर संदेश आने पर ब्राउज़र अलर्ट प्राप्त करें।',
    enableAlertsBtn: 'ब्राउज़र अलर्ट चालू करें',
    alertsEnabledLabel: 'ब्राउज़र अलर्ट चालू हैं',
    alertsBlockedLabel: 'ब्राउज़र सेटिंग्स में अलर्ट ब्लॉक हैं',
    alertsUnsupportedLabel: 'इस ब्राउज़र में सूचनाएं उपलब्ध नहीं हैं',
    pwaSectionTitle: 'ऐप इंस्टॉलेशन और मोबाइल रेडीनेस',
    pwaSectionDesc: 'तेज़ उपयोग के लिए Android या iPhone होम स्क्रीन पर TAGBACKLY इंस्टॉल करें।',
    securitySummaryTitle: 'सक्रिय गोपनीयता और सुरक्षा नियम',
    securitySummaryDesc:
      'अनुमान-रहित 12-अक्षरों के QR टोकन, शून्य पब्लिक निजी डेटा, रेट-लिमिटिंग, स्पैम-रोधी सुरक्षा, और NetworkOnly नीति जिससे निजी चैट या टोकन कभी ऑफ़लाइन कैश नहीं होते।',
    deleteAccountTitle: 'अकाउंट हटाएं',
    deleteAccountWarn:
      'आपका अकाउंट, सभी पंजीकृत आइटम, QR टैग, अपलोड की गई फोटो और बातचीत स्थायी रूप से हटा दी जाएगी।',
    deleteAccountBtn: 'मेरा अकाउंट हटाएं',
    confirmPasswordLabel: 'पुष्टि के लिए वर्तमान पासवर्ड दर्ज करें',
    // Public QR
    noAppNeeded: 'ऐप डाउनलोड की आवश्यकता नहीं',
    tagNotFoundTitle: 'टैग नहीं मिला',
    tagNotFoundDesc: 'यह QR टैग अमान्य हो सकता है या इसके मालिक द्वारा हटाया जा चुका है।',
    returnHomeBtn: 'TAGBACKLY पर वापस जाएं',
    itemDescriptionLabel: 'आइटम विवरण',
    ownerMessageLabel: 'मालिक का संदेश',
    rewardOfferedLabel: 'घोषित इनाम',
    contactOwner: 'मालिक से संपर्क करें',
    openConversation: 'चैट खोलें',
    reportAbuse: 'दुरुपयोग की रिपोर्ट करें',
    blockContact: 'संपर्क ब्लॉक करें',
    sendMessage: 'संदेश भेजें',
    finderSessionNotice:
      'आपका अनाम फाइंडर सत्र इस ब्राउज़र प्रोफ़ाइल पर सहेजा गया है ताकि बिना अकाउंट बनाए आप लौट सकें। ब्राउज़र बदलने या डेटा साफ़ करने से सत्र रीसेट हो सकता है।',
    privacyFooterNote:
      'TAGBACKLY मालिक की गोपनीयता की रक्षा करता है: निजी फ़ोन नंबर, ईमेल और घर का पता कभी सार्वजनिक QR पेज पर नहीं दिखाया जाता।',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const LANG_KEY = 'tagbackly_lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });

  function setLang(next: AppLanguage) {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Ignore storage error
    }
  }

  function t(key: TranslationKey): string {
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key];
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
