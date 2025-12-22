import nodemailer from "nodemailer";

export const transporter = ({ email, password }: { email: string; password: string }) => {
	return nodemailer.createTransport({
		service: "gmail",
		host: "smtp.gmail.com",
		port: 587,
		secure: true,
		auth: {
			user: email,
			pass: password,
		},
		pool: true,
		maxConnections: 5,
		maxMessages: Number.POSITIVE_INFINITY,
		rateLimit: 10,
		rateDelta: 1000,
	});
};
