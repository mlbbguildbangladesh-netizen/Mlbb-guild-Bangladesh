import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8 text-gray-300">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white">Privacy <span className="text-neon-blue">Policy</span></h1>
        <p className="text-gray-400">Effective Date: May 13, 2026</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 space-y-6 backdrop-blur-md">
        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">1. Information We Collect</h2>
          <p>
            When you register for an account, participate in tournaments, or otherwise interact with our application, we may collect the following information:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-400">
            <li><strong>Personal Information:</strong> Such as your email address, phone number (WhatsApp), and in-game credentials (e.g., Player ID).</li>
            <li><strong>Team Information:</strong> Such as your team name, logos, leader details, and roster information.</li>
            <li><strong>Usage Data:</strong> Information about how you interact with our platform, including match records, leaderboard standings, and device information.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">2. How We Use Your Information</h2>
          <p>
            The information we collect is used in the following ways:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-400">
            <li>To provide, operate, and maintain our gaming and tournament platform.</li>
            <li>To manage team registrations, match schedules, and leaderboards.</li>
            <li>To communicate with you regarding updates, announcements, and match reminders.</li>
            <li>To ensure fair play and enforce our terms of service during tournaments.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">3. Data Security and Storage</h2>
          <p>
            We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. Data is securely stored using Firebase and Google Cloud services. However, no method of transmission over the internet or electronic storage is 100% secure.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">4. Third-Party Services</h2>
          <p>
            We may use third-party services (such as Google Analytics or Firebase) to help us analyze how our service is used or to provide authentication. These third parties have access to your personal information only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">5. Your Privacy Rights</h2>
          <p>
            Depending on your location, you may have the right to access, update, or delete your personal information. If you wish to exercise these rights, please contact our support team.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold uppercase text-white">6. Changes to This Privacy Policy</h2>
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top.
          </p>
        </section>

        <section className="space-y-4 pt-4 border-t border-white/10">
          <h2 className="text-xl font-bold uppercase text-white">7. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact the administrators via our official Discord or WhatsApp channels.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
