TRUNCATE matter_access, users, matters RESTART IDENTITY CASCADE;
/*TRUNCATE ... CASCADE truncates every table holding a foreign key into the named ones
so wiping matters also wipes documents, and wiping documents also wipes chunks.
Running this seed empties your corpus.
*/

INSERT INTO users (email, display_name, role) VALUES
 ('attorney1@firmly.test', 'Dana Reyes', 'attorney'),
 ('attorney2@firmly.test', 'James Rutter', 'attorney'),
 ('paralegal1@firmly.test', 'Jessica Ji', 'paralegal');

 INSERT INTO matters (code, name, practice) VALUES
 ('A', 'Coinbase arbitration', 'litigation'),
 ('B', 'SEIU labor dispute', 'litigation'),
 ('C', 'Ohio v. EPA regulatory', 'regulatory'),
 ('D', 'Transactional contracts', 'transactional');

 -- Access grants, written as (matter, user) pairs. as mentioned ealier
 INSERT INTO matter_access (matter_id, user_id)
 SELECT m.id, u.id
 FROM matters m
 JOIN users u ON(
    (m.code = 'A' AND u.email IN('attorney1@firmly.test', 'attorney2@firmly.test', 'paralegal1@firmly.test'))
    OR (m.code = 'B' AND u.email IN('attorney1@firmly.test', 'attorney2@firmly.test', 'paralegal1@firmly.test'))
    OR (m.code = 'C' AND u.email IN('attorney1@firmly.test'))
    OR (m.code = 'D' AND u.email IN('attorney2@firmly.test', 'paralegal1@firmly.test'))
 );