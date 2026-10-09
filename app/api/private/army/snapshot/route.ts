import {NextResponse} from "next/server";
import {loadArmySnapshot} from "@/lib/army/store";
import {getVerifiedUser} from "@/lib/supabase/server";
import {isSupabaseConfigured} from "@/lib/supabase/config";
import {isSupabaseAdminConfigured} from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

export async function GET(){
 if(!isSupabaseConfigured()||!isSupabaseAdminConfigured())return NextResponse.json({error:"Army runtime backend not configured"},{status:503,headers});
 try{
  const {user}=await getVerifiedUser();
  if(!user)return NextResponse.json({error:"Authentication required"},{status:401,headers});
  const snapshot=await loadArmySnapshot(user.id);
  return NextResponse.json({snapshot,source:"supabase-runtime",liveStateConnected:true},{headers});
 }catch{
  return NextResponse.json({error:"Army snapshot unavailable"},{status:503,headers});
 }
}
