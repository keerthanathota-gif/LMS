-- V11: Categories table (Udemy/Coursera-style course categorization)
-- Supports parent-child hierarchy: "Development > Web Development > React"

CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(150) NOT NULL UNIQUE,
    parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    icon        VARCHAR(50),
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug   ON categories(slug);

-- Add category_id to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category_id);

-- ── Seed top-level categories (Udemy-style) ──────────────────────────────────

INSERT INTO categories (name, slug, icon, sort_order) VALUES
    ('Development',          'development',          'Code',          1),
    ('Business',             'business',             'Briefcase',     2),
    ('Finance & Accounting', 'finance-accounting',   'DollarSign',    3),
    ('IT & Software',        'it-software',          'Monitor',       4),
    ('Design',               'design',               'Palette',       5),
    ('Marketing',            'marketing',            'Megaphone',     6),
    ('Health & Fitness',     'health-fitness',       'Heart',         7),
    ('Personal Development', 'personal-development', 'User',          8),
    ('Teaching & Academics', 'teaching-academics',   'GraduationCap', 9),
    ('Data Science',         'data-science',         'BarChart',     10),
    ('Cloud Computing',      'cloud-computing',      'Cloud',        11),
    ('Security',             'security',             'Shield',       12)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed subcategories ───────────────────────────────────────────────────────

-- Development subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('Web Development',    'web-development',    (SELECT id FROM categories WHERE slug = 'development'), 1),
    ('Mobile Development', 'mobile-development', (SELECT id FROM categories WHERE slug = 'development'), 2),
    ('Game Development',   'game-development',   (SELECT id FROM categories WHERE slug = 'development'), 3),
    ('Programming Languages', 'programming-languages', (SELECT id FROM categories WHERE slug = 'development'), 4),
    ('DevOps',             'devops',             (SELECT id FROM categories WHERE slug = 'development'), 5)
ON CONFLICT (slug) DO NOTHING;

-- Data Science subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('Machine Learning',       'machine-learning',       (SELECT id FROM categories WHERE slug = 'data-science'), 1),
    ('AI & Deep Learning',     'ai-deep-learning',       (SELECT id FROM categories WHERE slug = 'data-science'), 2),
    ('Data Analysis',          'data-analysis',           (SELECT id FROM categories WHERE slug = 'data-science'), 3),
    ('Data Visualization',     'data-visualization',      (SELECT id FROM categories WHERE slug = 'data-science'), 4)
ON CONFLICT (slug) DO NOTHING;

-- Business subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('Entrepreneurship',  'entrepreneurship',  (SELECT id FROM categories WHERE slug = 'business'), 1),
    ('Communication',     'communication',     (SELECT id FROM categories WHERE slug = 'business'), 2),
    ('Management',        'management',        (SELECT id FROM categories WHERE slug = 'business'), 3),
    ('Sales',             'sales',             (SELECT id FROM categories WHERE slug = 'business'), 4),
    ('Strategy',          'strategy',          (SELECT id FROM categories WHERE slug = 'business'), 5)
ON CONFLICT (slug) DO NOTHING;

-- IT & Software subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('Network & Security', 'network-security', (SELECT id FROM categories WHERE slug = 'it-software'), 1),
    ('Hardware',           'hardware',         (SELECT id FROM categories WHERE slug = 'it-software'), 2),
    ('Operating Systems',  'operating-systems',(SELECT id FROM categories WHERE slug = 'it-software'), 3)
ON CONFLICT (slug) DO NOTHING;

-- Design subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('UI/UX Design',     'ui-ux-design',     (SELECT id FROM categories WHERE slug = 'design'), 1),
    ('Graphic Design',   'graphic-design',   (SELECT id FROM categories WHERE slug = 'design'), 2),
    ('Web Design',       'web-design',       (SELECT id FROM categories WHERE slug = 'design'), 3)
ON CONFLICT (slug) DO NOTHING;

-- Marketing subcategories
INSERT INTO categories (name, slug, parent_id, sort_order) VALUES
    ('Digital Marketing',    'digital-marketing',    (SELECT id FROM categories WHERE slug = 'marketing'), 1),
    ('SEO',                  'seo',                  (SELECT id FROM categories WHERE slug = 'marketing'), 2),
    ('Social Media Marketing', 'social-media-marketing', (SELECT id FROM categories WHERE slug = 'marketing'), 3),
    ('Content Marketing',    'content-marketing',    (SELECT id FROM categories WHERE slug = 'marketing'), 4)
ON CONFLICT (slug) DO NOTHING;
