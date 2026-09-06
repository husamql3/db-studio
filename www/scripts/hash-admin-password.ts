import { hashAdminPassword } from "../src/admin/auth";

const password = (await Bun.stdin.text()).trimEnd();
if (password.length < 5) {
	throw new Error("Enter a password of at least 5 characters on stdin");
}

process.stdout.write(`${await hashAdminPassword(password)}\n`);
