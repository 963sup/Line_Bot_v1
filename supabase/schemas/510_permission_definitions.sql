-- Identity/Access-owned closed permission catalog.

create type app_private.permission_name as enum ('users.read','users.suspend','workplaces.manage','partners.manage','partners.review');
