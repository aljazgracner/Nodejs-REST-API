const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  //1) CREATE A TRANSPORTER
  const transporter = nodemailer.createTransport({
    host: 'smtp.mailtrap.io',
    port: 2525,
    auth: {
      user: '0f3445bb9220f3',
      pass: '928d307ffb8a0e',
    },
  });

  //2) DEFINE THE EMAIL OPTIONS
  const mailOptions = {
    from: 'Taigarin messenger <taigarin.messenger@gmail.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
    //html:
  };

  //3) ACTUALLY SEND THE EMAIL
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
