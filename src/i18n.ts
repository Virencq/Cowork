import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  resources: {
    en: {
      translation: {
        chat: {
          input: {
            placeholder: 'What would you like me to do?',
            placeholderWithFiles: 'Add a message or drop files here',
          },
          time: {
            justNow: 'just now',
            minutesAgo: '{{n}} min ago',
            hoursAgo: '{{n}} hr ago',
            daysAgo: '{{n}} days ago',
          },
          copy: {
            copy: 'Copy',
            copied: 'Copied',
          },
          actions: {
            edit: 'Edit',
            delete: 'Delete',
          },
          layout: {
            openFiles: 'Open files',
            backToSessions: 'Back to sessions',
          },
          session: {
            readOnly: 'Read only',
            readOnlyHint: 'This session is read-only.',
            readOnlyPlaceholder: 'This session is read-only',
          },
          errors: {
            sessionFailed: 'Could not start the JCode session.',
            dismiss: 'Dismiss',
          },
          toolApproval: {
            title: 'Tool approval required',
            subtitle: 'JCode wants to run a tool in this workspace.',
            dangerous: 'Approval',
            cancel: 'Cancel',
            reject: 'Reject',
            approve: 'Approve',
          },
        },
      },
    },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
