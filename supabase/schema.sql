


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total integer := coalesce(cardinality(p_categoria_ids), 0);
BEGIN
  IF v_total < 1 OR v_total > 3 THEN
    RAISE EXCEPTION 'Selecione de 1 a 3 categorias (recebido: %).', v_total
      USING ERRCODE = '22023';
  END IF;

  IF array_position(p_categoria_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT c) FROM unnest(p_categoria_ids) c) <> v_total THEN
    RAISE EXCEPTION 'Categorias repetidas ou vazias.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.obras SET categoria_id = p_categoria_ids[1] WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.obra_categorias WHERE obra_id = p_obra_id;

  INSERT INTO public.obra_categorias (obra_id, categoria_id, ordem)
  SELECT p_obra_id, c, (n - 1)::smallint
    FROM unnest(p_categoria_ids) WITH ORDINALITY AS t(c, n);
END $$;


ALTER FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) IS 'Substitui as categorias da obra (1 a 3; a primeira vira a principal em obras.categoria_id).';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, is_autor)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'is_autor')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "is_autor" boolean DEFAULT false,
    "chave_pix" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "bio" "text",
    "avatar_url" "text"
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."meu_perfil"() RETURNS "public"."usuarios"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT * FROM public.usuarios WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."meu_perfil"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obter_recomendacoes"("p_limit" integer DEFAULT 6) RETURNS TABLE("obra_id" "uuid", "score" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH cats AS (
    SELECT oc.obra_id, array_agg(oc.categoria_id) AS ids
      FROM public.obra_categorias oc
     GROUP BY oc.obra_id
  ),
  interacoes AS (
    SELECT
      o.id AS obra_id,
      o.autor_id,
      coalesce(c.ids, '{}') AS categoria_ids,
      o.causa_id,
      o.tags,
      -- Uma obra apoiada (contribuição paga) pesa 3x mais que uma apenas
      -- salva/baixada de graça como sinal de preferência do leitor.
      CASE WHEN t.valor_pago > 0 THEN 3 ELSE 1 END AS peso
    FROM public.transacoes t
    JOIN public.obras o ON o.id = t.obra_id
    LEFT JOIN cats c ON c.obra_id = o.id
    WHERE t.usuario_id = auth.uid() AND t.status = 'concluido'
  )
  SELECT
    o.id AS obra_id,
    COALESCE(SUM(
      i.peso * (
        (CASE WHEN i.autor_id = o.autor_id THEN 3 ELSE 0 END) +
        (CASE WHEN i.causa_id IS NOT NULL AND i.causa_id = o.causa_id THEN 2 ELSE 0 END) +
        2 * cardinality(ARRAY(
          SELECT unnest(i.categoria_ids) INTERSECT SELECT unnest(coalesce(c.ids, '{}'))
        )) +
        cardinality(ARRAY(
          SELECT unnest(COALESCE(i.tags, '{}')) INTERSECT SELECT unnest(COALESCE(o.tags, '{}'))
        ))
      )
    ), 0)::numeric AS score
  FROM public.obras o
  LEFT JOIN cats c ON c.obra_id = o.id
  LEFT JOIN interacoes i ON true
  WHERE o.id NOT IN (SELECT obra_id FROM interacoes)
  GROUP BY o.id
  ORDER BY score DESC, o.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;


ALTER FUNCTION "public"."obter_recomendacoes"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."obter_recomendacoes"("p_limit" integer) IS 'Recomenda obras com base no histórico de transacoes do leitor logado (auth.uid()). Sem histórico, retorna as obras mais recentes.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sincronizar_categoria_principal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.obra_categorias
   WHERE obra_id = NEW.id
     AND (ordem = 0 OR categoria_id = NEW.categoria_id);

  IF NEW.categoria_id IS NOT NULL THEN
    INSERT INTO public.obra_categorias (obra_id, categoria_id, ordem)
    VALUES (NEW.id, NEW.categoria_id, 0);
  END IF;

  RETURN NULL;
END $$;


ALTER FUNCTION "public"."sincronizar_categoria_principal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tornar_se_autor"() RETURNS "public"."usuarios"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  perfil_atualizado public.usuarios;
BEGIN
  UPDATE public.usuarios
  SET is_autor = true
  WHERE id = auth.uid()
  RETURNING * INTO perfil_atualizado;

  IF perfil_atualizado.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum perfil encontrado para o usuário autenticado.';
  END IF;

  RETURN perfil_atualizado;
END;
$$;


ALTER FUNCTION "public"."tornar_se_autor"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."causas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text"
);


ALTER TABLE "public"."causas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."obra_categorias" (
    "obra_id" "uuid" NOT NULL,
    "categoria_id" "uuid" NOT NULL,
    "ordem" smallint NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "obra_categorias_ordem_check" CHECK ((("ordem" >= 0) AND ("ordem" <= 2)))
);


ALTER TABLE "public"."obra_categorias" OWNER TO "postgres";


COMMENT ON TABLE "public"."obra_categorias" IS 'Categorias de cada obra (até 3). ordem = 0 é a principal e espelha obras.categoria_id.';



CREATE TABLE IF NOT EXISTS "public"."obras" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "categoria_id" "uuid",
    "causa_id" "uuid",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "descricao" "text",
    "preco" numeric DEFAULT 0,
    "capa_url" "text",
    "arquivo_url" "text"
);


ALTER TABLE "public"."obras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "obra_id" "uuid" NOT NULL,
    "valor_pago" numeric(10,2) DEFAULT 0.00,
    "status" "text" DEFAULT 'concluido'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "gateway_id" "text",
    "request_id" "text",
    "metodo_pagamento" "text",
    "valor_autor" numeric(10,2),
    "valor_plataforma" numeric(10,2),
    "status_repasse" "text" DEFAULT 'nao_aplicavel'::"text",
    "gateway" "text" DEFAULT 'mercadopago'::"text",
    "gateway_payload" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transacoes_status_chk" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'concluido'::"text", 'falhou'::"text", 'estornado'::"text", 'contestado'::"text"])))
);


ALTER TABLE "public"."transacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gateway" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "evento_tipo" "text",
    "payment_id" "text",
    "assinatura_ok" boolean,
    "payload" "jsonb",
    "processado" boolean DEFAULT false,
    "erro" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_eventos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."causas"
    ADD CONSTRAINT "causas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."obra_categorias"
    ADD CONSTRAINT "obra_categorias_obra_categoria_key" UNIQUE ("obra_id", "categoria_id");



ALTER TABLE ONLY "public"."obra_categorias"
    ADD CONSTRAINT "obra_categorias_obra_ordem_key" UNIQUE ("obra_id", "ordem");



ALTER TABLE ONLY "public"."obra_categorias"
    ADD CONSTRAINT "obra_categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."obras"
    ADD CONSTRAINT "obras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transacoes"
    ADD CONSTRAINT "transacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_eventos"
    ADD CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "idx_transacoes_gateway_id" ON "public"."transacoes" USING "btree" ("gateway_id") WHERE ("gateway_id" IS NOT NULL);



CREATE INDEX "idx_transacoes_request_id" ON "public"."transacoes" USING "btree" ("request_id");



CREATE INDEX "obra_categorias_categoria_idx" ON "public"."obra_categorias" USING "btree" ("categoria_id");



CREATE INDEX "obras_autor_idx" ON "public"."obras" USING "btree" ("autor_id");



CREATE UNIQUE INDEX "transacoes_acesso_gratuito_uniq" ON "public"."transacoes" USING "btree" ("usuario_id", "obra_id") WHERE (("gateway_id" IS NULL) AND ("request_id" IS NULL));



CREATE UNIQUE INDEX "transacoes_gateway_id_uniq" ON "public"."transacoes" USING "btree" ("gateway_id") WHERE ("gateway_id" IS NOT NULL);



CREATE INDEX "transacoes_obra_idx" ON "public"."transacoes" USING "btree" ("obra_id");



CREATE UNIQUE INDEX "transacoes_request_id_uniq" ON "public"."transacoes" USING "btree" ("request_id") WHERE ("request_id" IS NOT NULL);



CREATE INDEX "transacoes_usuario_idx" ON "public"."transacoes" USING "btree" ("usuario_id");



CREATE INDEX "webhook_eventos_pendentes_idx" ON "public"."webhook_eventos" USING "btree" ("created_at") WHERE ("processado" = false);



CREATE OR REPLACE TRIGGER "obras_sincronizar_categoria_principal" AFTER INSERT OR UPDATE OF "categoria_id" ON "public"."obras" FOR EACH ROW EXECUTE FUNCTION "public"."sincronizar_categoria_principal"();



CREATE OR REPLACE TRIGGER "transacoes_set_updated_at" BEFORE UPDATE ON "public"."transacoes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."obra_categorias"
    ADD CONSTRAINT "obra_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obra_categorias"
    ADD CONSTRAINT "obra_categorias_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obras"
    ADD CONSTRAINT "obras_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."obras"
    ADD CONSTRAINT "obras_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."obras"
    ADD CONSTRAINT "obras_causa_id_fkey" FOREIGN KEY ("causa_id") REFERENCES "public"."causas"("id");



ALTER TABLE ONLY "public"."transacoes"
    ADD CONSTRAINT "transacoes_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transacoes"
    ADD CONSTRAINT "transacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



CREATE POLICY "Autor gerencia categorias das suas obras" ON "public"."obra_categorias" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."obras" "o"
  WHERE (("o"."id" = "obra_categorias"."obra_id") AND ("o"."autor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."obras" "o"
  WHERE (("o"."id" = "obra_categorias"."obra_id") AND ("o"."autor_id" = "auth"."uid"())))));



CREATE POLICY "Autores editam suas obras" ON "public"."obras" FOR UPDATE USING (("auth"."uid"() = "autor_id")) WITH CHECK (("auth"."uid"() = "autor_id"));



CREATE POLICY "Autores inserem suas obras" ON "public"."obras" FOR INSERT WITH CHECK ((("auth"."uid"() = "autor_id") AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_autor" = true))))));



CREATE POLICY "Autores podem atualizar e deletar suas obras" ON "public"."obras" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "autor_id")) WITH CHECK (("auth"."uid"() = "autor_id"));



CREATE POLICY "Autores podem deletar suas obras" ON "public"."obras" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "autor_id"));



CREATE POLICY "Autores podem inserir suas proprias obras" ON "public"."obras" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "autor_id"));



CREATE POLICY "Autores removem suas obras" ON "public"."obras" FOR DELETE USING (("auth"."uid"() = "autor_id"));



CREATE POLICY "Categorias de obras são públicas" ON "public"."obra_categorias" FOR SELECT USING (true);



CREATE POLICY "Obras são públicas para visualização" ON "public"."obras" FOR SELECT USING (true);



CREATE POLICY "Perfil próprio ou de autor é visível" ON "public"."usuarios" FOR SELECT USING ((("is_autor" = true) OR ("auth"."uid"() = "id")));



CREATE POLICY "Permitir leitura pública de categorias" ON "public"."categorias" FOR SELECT USING (true);



CREATE POLICY "Usuários inserem o próprio perfil" ON "public"."usuarios" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem editar o próprio perfil" ON "public"."usuarios" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuários podem gerenciar suas transacoes" ON "public"."transacoes" TO "authenticated" USING (("auth"."uid"() = "usuario_id")) WITH CHECK (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Usuários registram acesso gratuito" ON "public"."transacoes" FOR INSERT WITH CHECK ((("auth"."uid"() = "usuario_id") AND ("valor_pago" = (0)::numeric) AND ("gateway_id" IS NULL)));



CREATE POLICY "Usuários veem suas transações" ON "public"."transacoes" FOR SELECT USING (("auth"."uid"() = "usuario_id"));



ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."causas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obra_categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_eventos" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."definir_categorias_obra"("p_obra_id" "uuid", "p_categoria_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."usuarios" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("id") ON TABLE "public"."usuarios" TO "authenticated";



GRANT SELECT("nome") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("nome"),UPDATE("nome") ON TABLE "public"."usuarios" TO "authenticated";



GRANT SELECT("is_autor") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("is_autor") ON TABLE "public"."usuarios" TO "authenticated";



GRANT UPDATE("chave_pix") ON TABLE "public"."usuarios" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."usuarios" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("bio"),UPDATE("bio") ON TABLE "public"."usuarios" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT("avatar_url"),UPDATE("avatar_url") ON TABLE "public"."usuarios" TO "authenticated";



GRANT ALL ON FUNCTION "public"."meu_perfil"() TO "anon";
GRANT ALL ON FUNCTION "public"."meu_perfil"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."meu_perfil"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obter_recomendacoes"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."obter_recomendacoes"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."obter_recomendacoes"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sincronizar_categoria_principal"() TO "anon";
GRANT ALL ON FUNCTION "public"."sincronizar_categoria_principal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sincronizar_categoria_principal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tornar_se_autor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tornar_se_autor"() TO "anon";
GRANT ALL ON FUNCTION "public"."tornar_se_autor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tornar_se_autor"() TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON TABLE "public"."causas" TO "anon";
GRANT ALL ON TABLE "public"."causas" TO "authenticated";
GRANT ALL ON TABLE "public"."causas" TO "service_role";



GRANT ALL ON TABLE "public"."obra_categorias" TO "anon";
GRANT ALL ON TABLE "public"."obra_categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."obra_categorias" TO "service_role";



GRANT ALL ON TABLE "public"."obras" TO "anon";
GRANT ALL ON TABLE "public"."obras" TO "authenticated";
GRANT ALL ON TABLE "public"."obras" TO "service_role";



GRANT ALL ON TABLE "public"."transacoes" TO "anon";
GRANT ALL ON TABLE "public"."transacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."transacoes" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_eventos" TO "anon";
GRANT ALL ON TABLE "public"."webhook_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_eventos" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







