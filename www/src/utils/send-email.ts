import { transporter } from "@/lib/nodemailer";
import htmlContent from "../../public/joined-wishlist.html?raw";

export const sendEmail = async ({
	to,
	email,
	password,
}: {
	to: string;
	email: string;
	password: string;
}) => {
	try {
		const transport = transporter({ email, password });

		const data = await transport.sendMail({
			from: "husamahmud@gmail.com",
			to,
			subject: "Welcome to DB Studio ❤️",
			html: htmlContent,
		});

		console.log("Email sent successfully:", data);
		return data;
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error("Error sending email to", to, ":", error.message);
		} else {
			console.error("Error sending email to", to, ":", String(error));
		}
		throw error;
	}
};
