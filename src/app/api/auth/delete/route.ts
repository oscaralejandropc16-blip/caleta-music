import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

        if (!url || !roleKey) {
            return NextResponse.json({
                error: "Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY en el servidor para borrar cuentas."
            }, { status: 500 });
        }

        // 1. Verificar el token del usuario que hace la solicitud
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const token = authHeader.replace("Bearer ", "");
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

        const reqClient = createClient(url, anonKey);
        const { data: { user }, error: authError } = await reqClient.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ error: "Token inválido" }, { status: 401 });
        }

        // 2. Borrar el usuario con la llave administradora
        const adminClient = createClient(url, roleKey);
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
