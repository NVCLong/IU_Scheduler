import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CoursesEntity } from '../courses/courses.entity';

@Entity('course_position')
export class CoursePositionEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'course_position_id' })
  id: number;

  @Column({ name: 'days_in_week' })
  days: number;

  @Column({ name: 'periods' })
  periods: number;

  @OneToMany(() => CoursesEntity, (course) => course.coursePosition)
  course: CoursesEntity[];
}
