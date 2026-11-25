-- Match the room IDs already used by the workstation pages. A production
-- handoff can arrive before anyone has opened the corresponding chat.
INSERT INTO public.chat_rooms (id, name, kind, station) VALUES
  ('station-sanding', 'Sanding', 'station', 'SANDING'),
  ('station-bending', 'Bending', 'station', 'BENDING'),
  ('station-welding', 'Welding', 'station', 'WELDING'),
  ('station-film_coating', 'Film Coating', 'station', 'FILM_COATING'),
  ('station-glueing', 'Glueing', 'station', 'GLUEING'),
  ('station-qc', 'Quality Control', 'station', 'QC'),
  ('station-logistics', 'Logistics', 'station', 'LOGISTICS')
ON CONFLICT (id) DO NOTHING;
