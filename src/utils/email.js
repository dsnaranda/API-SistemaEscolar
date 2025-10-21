require("dotenv").config();
const nodemailer = require("nodemailer");

const userGmail = process.env.GMAIL_USER;
const passAppGmail = process.env.GMAIL_PASS;
//https://myaccount.google.com/apppasswords

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: userGmail,
        pass: passAppGmail,
    },
    tls: {
        rejectUnauthorized: false, 
    },
});

const enviarCorreo = async (destinatario, asunto, mensaje) => {
    const mailOptions = {
        from: userGmail,
        to: destinatario,
        subject: asunto,
        html: mensaje,
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log("Correo enviado: " + info.response);
    } catch (error) {
        console.error("Error al enviar el correo:", error);
    }
};

module.exports = { enviarCorreo };